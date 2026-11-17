/*
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('../clients/publicApiClient', () => ({ get: (...args: unknown[]) => get(...args) }));

const createProviderTemplate = vi.fn();
const getProviderTemplates = vi.fn();
vi.mock('./providerTemplateApis', () => ({
  createProviderTemplate: (...args: unknown[]) => createProviderTemplate(...args),
  getProviderTemplates: (...args: unknown[]) => getProviderTemplates(...args),
}));
vi.mock('../paths', () => ({ PLATFORM_API_BASE_URL: '/cp' }));

const config = vi.hoisted(() => ({ url: 'https://hub.test/v1', enabled: true }));
vi.mock('../config.env', () => ({
  get API_BASE_URLS() {
    return { modelHubApi: config.url };
  },
  isFeatureEnabled: () => config.enabled,
}));

import {
  addHubProviderToOrganization,
  findTemplateForHubProvider,
  getModelHubProviders,
  needsEndpointUrl,
  toImportBody,
  getModelHubTemplate,
  hubProvidersToOffer,
  isModelHubEnabled,
  toModelHubProvider,
} from './modelHubApis';
import type { ProviderTemplate } from '../utils/types';

const vllm = {
  name: 'vllm',
  version: '1.0',
  displayName: 'vLLM',
  hosting: 'self-hosted',
  certificationLevel: 'validated',
};
const openai = { ...vllm, name: 'openai', displayName: 'OpenAI', iconUrl: 'providers/openai/versions/1.0/icon' };

beforeEach(() => {
  get.mockReset();
  createProviderTemplate.mockReset();
  getProviderTemplates.mockReset();
  config.url = 'https://hub.test/v1';
  config.enabled = true;
});

describe('isModelHubEnabled', () => {
  it('needs both the flag and a Hub URL', () => {
    expect(isModelHubEnabled()).toBe(true);
    config.url = '';
    expect(isModelHubEnabled()).toBe(false);
    config.url = 'https://hub.test/v1';
    config.enabled = false;
    expect(isModelHubEnabled()).toBe(false);
  });
});

describe('toModelHubProvider', () => {
  it('resolves the icon against the Hub URL', () => {
    expect(toModelHubProvider(openai).iconUrl).toBe('https://hub.test/v1/providers/openai/versions/1.0/icon');
  });

  it('drops an icon that is not the Hub icon route', () => {
    for (const iconUrl of ['https://evil.test/x.png', 'javascript:alert(1)', '../secret']) {
      expect(toModelHubProvider({ ...openai, iconUrl }).iconUrl).toBeUndefined();
    }
  });
});

describe('getModelHubProviders', () => {
  it('reads the list and skips entries without a name', async () => {
    get.mockResolvedValue({ count: 2, data: [vllm, { displayName: 'nameless' }] });
    const providers = await getModelHubProviders();
    expect(providers.map((p) => p.name)).toEqual(['vllm']);
    expect(get).toHaveBeenCalledWith('/providers', { limit: 100 }, 'https://hub.test/v1');
  });
});

describe('getModelHubTemplate', () => {
  it('returns the Platform API template body for the picked provider', async () => {
    get.mockResolvedValue({ data: { id: 'vllm', displayName: 'vLLM', version: 'v1.0', managedBy: 'wso2' } });
    const template = await getModelHubTemplate('vllm', '1.0');
    expect(template.id).toBe('vllm');
    expect(get).toHaveBeenCalledWith(
      '/providers/vllm/versions/1.0/templates/platform',
      undefined,
      'https://hub.test/v1'
    );
  });

  it('refuses a template for a different provider', async () => {
    get.mockResolvedValue({ data: { id: 'openai', displayName: 'OpenAI', version: 'v1.0' } });
    await expect(getModelHubTemplate('vllm', '1.0')).rejects.toThrow('unexpected template');
  });
});

describe('hubProvidersToOffer', () => {
  const hub = [toModelHubProvider(openai), toModelHubProvider(vllm)];
  const template = (fields: Partial<ProviderTemplate>) =>
    ({ id: 'x', displayName: 'X', version: 'v1.0', ...fields }) as ProviderTemplate;

  it('hides providers the organization already has', () => {
    expect(hubProvidersToOffer(hub, [template({ id: 'openai' })]).map((p) => p.name)).toEqual(['vllm']);
  });

  it('matches a versioned template id and a built-in group id', () => {
    expect(hubProvidersToOffer(hub, [template({ id: 'vllm-v1-1' })]).map((p) => p.name)).toEqual(['openai']);
    expect(hubProvidersToOffer(hub, [template({ id: 'my-openai', groupId: 'wso2-openai' })]).map((p) => p.name)).toEqual([
      'vllm',
    ]);
  });

  it('offers everything to an organization with no templates', () => {
    expect(hubProvidersToOffer(hub, [])).toHaveLength(2);
  });
});

describe('importing a Hub provider', () => {
  const provider = toModelHubProvider(vllm);
  const hubTemplate = {
    id: 'vllm',
    displayName: 'vLLM',
    version: 'v1.0',
    managedBy: 'wso2',
    metadata: { auth: { type: 'apiKey', header: 'Authorization', valuePrefix: 'Bearer ' } },
  } as ProviderTemplate;
  // Platform API names the template after its display name, not the body's id.
  const created = { ...hubTemplate, id: 'vllm-v1-0', groupId: 'vllm', managedBy: 'model-hub' } as ProviderTemplate;
  const httpError = (status: number) => Object.assign(new Error('request failed'), { status });

  it("never sends 'wso2', which Platform API reserves for its built-ins", () => {
    expect(toImportBody(hubTemplate).managedBy).toBe('model-hub');
  });

  it('asks for an endpoint only when the Hub has none', () => {
    expect(needsEndpointUrl(hubTemplate)).toBe(true);
    const withUrl = toImportBody(hubTemplate, ' https://vllm.example.com/v1 ');
    expect(withUrl.metadata?.endpointUrl).toBe('https://vllm.example.com/v1');
    expect(withUrl.metadata?.auth?.header).toBe('Authorization');
    expect(needsEndpointUrl(withUrl)).toBe(false);
  });

  it('creates the template and returns what Platform API stored', async () => {
    createProviderTemplate.mockResolvedValue(created);
    await expect(addHubProviderToOrganization(provider, hubTemplate, 'https://vllm.example.com/v1')).resolves.toBe(created);
    const [body, base] = createProviderTemplate.mock.calls[0];
    expect(base).toBe('/cp');
    expect(body).toMatchObject({ managedBy: 'model-hub', metadata: { endpointUrl: 'https://vllm.example.com/v1' } });
  });

  it('uses the existing template when the organization already has it (409)', async () => {
    createProviderTemplate.mockRejectedValue(httpError(409));
    getProviderTemplates.mockResolvedValue({ list: [{ id: 'openai', displayName: 'OpenAI', version: 'v1.0' }, created] });
    await expect(addHubProviderToOrganization(provider, hubTemplate, 'https://x.example.com')).resolves.toBe(created);
  });

  it('passes a permission failure (403) to the caller', async () => {
    createProviderTemplate.mockRejectedValue(httpError(403));
    await expect(addHubProviderToOrganization(provider, hubTemplate)).rejects.toMatchObject({ status: 403 });
    expect(getProviderTemplates).not.toHaveBeenCalled();
  });

  it('matches the template Platform API generated from the display name', () => {
    const azure = toModelHubProvider({ ...vllm, name: 'azure-oai', displayName: 'Azure OpenAI' });
    const templates = [{ id: 'azure-openai-v1-0', groupId: 'azure-openai', displayName: 'Azure OpenAI', version: 'v1.0' } as ProviderTemplate];
    expect(findTemplateForHubProvider(azure, templates)?.id).toBe('azure-openai-v1-0');
    expect(hubProvidersToOffer([azure], templates)).toEqual([]);
  });
});

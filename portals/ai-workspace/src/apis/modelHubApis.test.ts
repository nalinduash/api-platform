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

const config = vi.hoisted(() => ({ url: 'https://hub.test/v1', enabled: true }));
vi.mock('../config.env', () => ({
  get API_BASE_URLS() {
    return { modelHubApi: config.url };
  },
  isFeatureEnabled: () => config.enabled,
}));

import {
  getModelHubProviders,
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

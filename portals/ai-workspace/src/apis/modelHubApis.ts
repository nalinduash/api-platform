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

import { get } from '../clients/publicApiClient';
import { API_BASE_URLS, isFeatureEnabled } from '../config.env';
import { PLATFORM_API_BASE_URL } from '../paths';
import { getErrorCode, getErrorMessage, getHttpStatus } from '../utils/apiError';
import { createProviderTemplate, getProviderTemplates } from './providerTemplateApis';
import { familyHandle } from '../utils/providerTemplateDisplay';
import type { ProviderTemplate } from '../utils/types';

/**
 * Model Hub client. The Hub is a public, read-only catalog of LLM providers; its
 * paths and envelope copy Policy Hub's. A Hub provider becomes an organization
 * template only when a user picks it, through the existing template API.
 *
 * The wire is untyped, so every response goes through a normalizer.
 */

/** A provider as the Hub lists it. */
export interface ModelHubProvider {
  name: string;
  version: string;
  displayName: string;
  description: string;
  hosting: string;
  certificationLevel: string;
  /** Absolute icon URL, or undefined when the provider has none. */
  iconUrl?: string;
}

/** True when this deployment shows Model Hub providers. */
export const isModelHubEnabled = (): boolean =>
  isFeatureEnabled('model-hub') && Boolean(API_BASE_URLS.modelHubApi);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

// The icon path is relative to the Hub. Only the Hub's own icon route is used,
// so a tampered response cannot point an <img> anywhere else.
const ICON_PATH = /^providers\/[a-z0-9-]+\/versions\/[0-9]+\.[0-9]+\/icon$/;

export const toModelHubProvider = (value: unknown): ModelHubProvider => {
  const source = asRecord(value);
  const iconPath = str(source.iconUrl);
  return {
    name: str(source.name),
    version: str(source.version),
    displayName: str(source.displayName) || str(source.name),
    description: str(source.description),
    hosting: str(source.hosting),
    certificationLevel: str(source.certificationLevel),
    iconUrl: ICON_PATH.test(iconPath)
      ? `${API_BASE_URLS.modelHubApi.replace(/\/+$/, '')}/${iconPath}`
      : undefined,
  };
};

/** GET /providers — the latest version of every Hub provider. */
export const getModelHubProviders = async (): Promise<ModelHubProvider[]> => {
  const body = asRecord(
    await get<unknown>('/providers', { limit: 100 }, API_BASE_URLS.modelHubApi)
  );
  const data = Array.isArray(body.data) ? body.data : [];
  return data.map(toModelHubProvider).filter((p) => p.name !== '');
};

/**
 * GET /providers/{name}/versions/{version}/templates/platform — the body
 * POST /llm-provider-templates takes, derived by the Hub from the definition.
 */
export const getModelHubTemplate = async (
  name: string,
  version: string
): Promise<ProviderTemplate> => {
  const body = asRecord(
    await get<unknown>(
      `/providers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}/templates/platform`,
      undefined,
      API_BASE_URLS.modelHubApi
    )
  );
  const template = asRecord(body.data) as unknown as ProviderTemplate;
  // The template must be the one that was picked, or importing it would
  // create something the user did not choose.
  if (template.id !== name || !template.displayName || !template.version) {
    throw new Error('The Model Hub returned an unexpected template.');
  }
  return template;
};

/**
 * Who manages an imported template. Platform API reserves 'wso2' for its own
 * built-ins, and this also records that the template came from the Hub.
 */
export const HUB_MANAGED_BY = 'model-hub';

/**
 * The handle Platform API derives from a display name: lower case, spaces and
 * underscores as hyphens, other characters dropped. It ignores a template's id.
 */
const handleOf = (displayName: string): string =>
  displayName
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/** True when the template is (any version of) this Hub provider. */
const isTemplateOf = (template: ProviderTemplate, provider: ModelHubProvider): boolean => {
  const names = new Set([provider.name, `wso2-${provider.name}`, handleOf(provider.displayName)]);
  const family = familyHandle(template.id).toLowerCase();
  const group = (template.groupId ?? '').toLowerCase();
  return names.has(family) || names.has(group);
};

/**
 * The Hub providers the organization does not have yet. A provider the
 * organization already has a template for (the built-ins, or one imported
 * earlier) is offered through that template instead.
 */
export const hubProvidersToOffer = (
  hubProviders: ModelHubProvider[],
  templates: ProviderTemplate[]
): ModelHubProvider[] =>
  hubProviders.filter((p) => !templates.some((t) => isTemplateOf(t, p)));

/** The organization's template for a Hub provider, if it has one. */
export const findTemplateForHubProvider = (
  provider: ModelHubProvider,
  templates: ProviderTemplate[]
): ProviderTemplate | undefined =>
  templates.find((t) => isTemplateOf(t, provider) && t.isLatest !== false) ??
  templates.find((t) => isTemplateOf(t, provider));

/**
 * Platform API needs a default endpoint on every template. A self-hosted
 * provider has none in the Hub, so the user supplies their server's URL.
 */
export const needsEndpointUrl = (template: ProviderTemplate): boolean =>
  !template.metadata?.endpointUrl;

/** The body to POST for an import, with the endpoint the user gave, if any. */
export const toImportBody = (template: ProviderTemplate, endpointUrl?: string): ProviderTemplate => ({
  ...template,
  managedBy: HUB_MANAGED_BY,
  metadata: {
    ...template.metadata,
    endpointUrl: endpointUrl?.trim() || template.metadata?.endpointUrl,
  },
});

/**
 * Adds a Hub provider's template to the organization and returns the template.
 * When the organization already has it (added in another tab, say), Platform
 * API answers 409 and the existing template is returned instead. Any other
 * failure, a 403 included, is thrown for the caller to report.
 */
export const addHubProviderToOrganization = async (
  provider: ModelHubProvider,
  template: ProviderTemplate,
  endpointUrl?: string
): Promise<ProviderTemplate> => {
  try {
    return await createProviderTemplate(toImportBody(template, endpointUrl), PLATFORM_API_BASE_URL);
  } catch (error) {
    if (getHttpStatus(error) !== 409) throw error;
    const existing = findTemplateForHubProvider(
      provider,
      (await getProviderTemplates(PLATFORM_API_BASE_URL)).list ?? []
    );
    if (!existing) throw error;
    return existing;
  }
};

/**
 * What to tell the user when adding a Hub provider failed. Platform API's
 * validation messages are written for users (a rejected server URL, say), so
 * they are shown as they are; anything else gets a generic message.
 */
export const hubImportErrorMessage = (error: unknown): string => {
  if (getHttpStatus(error) === 403) return 'You do not have permission to add provider templates.';
  if (getErrorCode(error) === 'VALIDATION_FAILED') {
    return getErrorMessage(error, 'The provider could not be added from the Model Hub.');
  }
  return 'The provider could not be added from the Model Hub. Try again.';
};

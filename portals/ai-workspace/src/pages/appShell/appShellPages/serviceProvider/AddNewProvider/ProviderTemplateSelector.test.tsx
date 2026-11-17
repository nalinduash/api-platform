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

import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../../../test/utils';
import type { ModelHubProvider } from '../../../../../apis/modelHubApis';
import type { ProviderTemplate, ProviderTemplatesResponse } from '../../../../../utils/types';
import ProviderTemplateSelector from './ProviderTemplateSelector';

const openaiTemplate = { id: 'openai', displayName: 'OpenAI', version: 'v1.0', isLatest: true } as ProviderTemplate;
const templates: ProviderTemplatesResponse = {
  count: 1,
  list: [openaiTemplate],
  pagination: { total: 1, offset: 0, limit: 1 },
};
const hub = (name: string, displayName: string): ModelHubProvider => ({
  name,
  version: '1.0',
  displayName,
  description: '',
  hosting: 'hosted',
  certificationLevel: 'validated',
});

function renderSelector(props: Partial<React.ComponentProps<typeof ProviderTemplateSelector>> = {}) {
  return renderWithProviders(
    <ProviderTemplateSelector
      templatesLoading={false}
      templatesError={null}
      templatesResponse={templates}
      selectedTemplateId={null}
      onSelectTemplate={vi.fn()}
      onRetryTemplates={vi.fn()}
      {...props}
    />
  );
}

describe('ProviderTemplateSelector with Model Hub providers', () => {
  it('offers Hub providers the organization does not have, with a badge', async () => {
    const onSelectHubProvider = vi.fn();
    const { user } = renderSelector({
      hubProviders: [hub('openai', 'OpenAI'), hub('vllm', 'vLLM')],
      onSelectHubProvider,
    });

    expect(screen.getByText('From Model Hub')).toBeInTheDocument();
    expect(screen.getByText('vLLM')).toBeInTheDocument();
    expect(screen.getByText('Model Hub')).toBeInTheDocument();
    // OpenAI is already an organization template, so it shows once, not twice.
    expect(screen.getAllByText('OpenAI')).toHaveLength(1);

    await user.click(screen.getByText('vLLM'));
    expect(onSelectHubProvider).toHaveBeenCalledWith(expect.objectContaining({ name: 'vllm' }));
  });

  it('shows no Hub section when the Hub is not wired in', () => {
    renderSelector({ hubProviders: [hub('vllm', 'vLLM')] });
    expect(screen.queryByText('From Model Hub')).not.toBeInTheDocument();
  });

  it('shows no Hub section when every Hub provider is already a template', () => {
    renderSelector({ hubProviders: [hub('openai', 'OpenAI')], onSelectHubProvider: vi.fn() });
    expect(screen.queryByText('From Model Hub')).not.toBeInTheDocument();
  });

  it('shows progress on the provider being added', () => {
    renderSelector({
      hubProviders: [hub('vllm', 'vLLM')],
      onSelectHubProvider: vi.fn(),
      importingHubProvider: 'vllm',
    });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Model Hub')).not.toBeInTheDocument();
  });
});

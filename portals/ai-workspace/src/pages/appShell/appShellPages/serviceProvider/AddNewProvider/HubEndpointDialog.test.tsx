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
import HubEndpointDialog, { isEndpointUrl } from './HubEndpointDialog';

describe('isEndpointUrl', () => {
  it('accepts http and https URLs with a host only', () => {
    expect(isEndpointUrl('https://vllm.example.com/v1')).toBe(true);
    expect(isEndpointUrl('http://vllm.internal:8000')).toBe(true);
    expect(isEndpointUrl('ftp://vllm.example.com')).toBe(false);
    expect(isEndpointUrl('javascript:alert(1)')).toBe(false);
    expect(isEndpointUrl('https://user:pw@vllm.example.com')).toBe(false);
    expect(isEndpointUrl('vllm.example.com')).toBe(false);
  });
});

describe('HubEndpointDialog', () => {
  it('confirms only once a valid URL is entered', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithProviders(
      <HubEndpointDialog open displayName="vLLM" onClose={vi.fn()} onConfirm={onConfirm} />
    );
    expect(screen.getByText('Where is your vLLM server?')).toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Add provider' });
    expect(add).toBeDisabled();

    await user.type(screen.getByRole('textbox'), 'https://vllm.example.com/v1');
    expect(add).toBeEnabled();
    await user.click(add);
    expect(onConfirm).toHaveBeenCalledWith('https://vllm.example.com/v1');
  });
});

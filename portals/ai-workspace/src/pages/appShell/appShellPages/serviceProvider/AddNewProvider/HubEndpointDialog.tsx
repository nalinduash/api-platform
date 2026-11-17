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

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@wso2/oxygen-ui';
import { FormattedMessage, useIntl } from 'react-intl';

const ID = 'aiWorkspace.pages.appShell.appShellPages.serviceProvider.AddNewProvider.HubEndpointDialog';

/** An http(s) URL with a host. The Platform API applies its own checks on top. */
export const isEndpointUrl = (value: string): boolean => {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '' && !url.username;
  } catch {
    return false;
  }
};

interface HubEndpointDialogProps {
  open: boolean;
  displayName: string;
  onClose: () => void;
  onConfirm: (endpointUrl: string) => void;
}

/**
 * Asks for the URL of a self-hosted server before its Hub template is added:
 * the Hub has no default URL for it, and a template needs one.
 */
export default function HubEndpointDialog({ open, displayName, onClose, onConfirm }: HubEndpointDialogProps) {
  const intl = useIntl();
  const [url, setUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = isEndpointUrl(url);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <FormattedMessage id={`${ID}.title`} defaultMessage="Where is your {name} server?" values={{ name: displayName }} />
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <FormattedMessage
            id={`${ID}.description`}
            defaultMessage="{name} runs in your own network, so the Model Hub has no default URL for it. Enter the base URL of your server."
            values={{ name: displayName }}
          />
        </Typography>
        <TextField
          autoFocus
          fullWidth
          label={intl.formatMessage({ id: `${ID}.label`, defaultMessage: 'Server URL' })}
          placeholder="https://vllm.example.com/v1"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && !valid}
          helperText={
            touched && !valid
              ? intl.formatMessage({ id: `${ID}.invalid`, defaultMessage: 'Enter an http or https URL.' })
              : undefined
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          <FormattedMessage id={`${ID}.cancel`} defaultMessage="Cancel" />
        </Button>
        <Button variant="contained" disabled={!valid} onClick={() => onConfirm(url.trim())}>
          <FormattedMessage id={`${ID}.add`} defaultMessage="Add provider" />
        </Button>
      </DialogActions>
    </Dialog>
  );
}

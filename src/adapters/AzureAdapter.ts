/**
 * Azure OpenAI provider adapter
 */

import { OpenAIAdapter } from './OpenAIAdapter';
import type { LLMProvider, ProviderConfig } from '../types/providers';

/**
 * Azure OpenAI adapter - extends OpenAI adapter with Azure-specific configuration
 */
export class AzureAdapter extends OpenAIAdapter {
  public override readonly provider: LLMProvider = 'azure';
  public override readonly name = 'Azure OpenAI';

  protected override onInitialize(): void {
    super.onInitialize();

    // Azure uses a different base URL structure
    if (this.config.baseUrl) {
      this.setBaseUrl(this.config.baseUrl);
    } else if (this.config.region) {
      // Construct Azure URL from region
      const azureBaseUrl = `https://${this.config.region}.openai.azure.com/openai`;
      this.setBaseUrl(azureBaseUrl);
    }
  }

  protected override buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Azure uses api-key header instead of Authorization
    if (this.config.apiKey) {
      headers['api-key'] = this.config.apiKey;
    }

    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }

    return headers;
  }

  protected override async makeRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    // Azure uses deployments and API versions in the URL
    const deployment = this.config.defaultModel ?? 'gpt-35-turbo';
    const apiVersion = '2024-02-01';

    let url: string;
    if (path === '/models') {
      url = `${this.getBaseUrl()}/models?api-version=${apiVersion}`;
    } else if (path === '/chat/completions') {
      url = `${this.getBaseUrl()}/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    } else {
      url = `${this.getBaseUrl()}${path}?api-version=${apiVersion}`;
    }

    const headers = this.buildHeaders();

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  public override async getModels(): Promise<readonly string[]> {
    return [
      'gpt-4o',
      'gpt-4',
      'gpt-4-32k',
      'gpt-35-turbo',
      'gpt-35-turbo-16k',
      'text-embedding-ada-002',
      'text-embedding-3-small',
      'text-embedding-3-large',
    ];
  }

  // Helper methods to access protected members
  private setBaseUrl(url: string): void {
    // Use type assertion to access protected member
    (this as unknown as { baseUrl: string }).baseUrl = url;
  }

  private getBaseUrl(): string {
    return (this as unknown as { baseUrl: string }).baseUrl;
  }
}

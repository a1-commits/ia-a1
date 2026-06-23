import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  modelIsInstalled,
  parseOllamaChatResponse,
  parseOllamaErrorBody,
} from '../src/domains/ai/ollamaProvider';

describe('parseOllamaChatResponse', () => {
  it('extrai conteúdo de message.content', () => {
    const text = parseOllamaChatResponse(
      JSON.stringify({ message: { content: 'Ok' }, done: true }),
    );
    assert.equal(text, 'Ok');
  });

  it('retorna null quando resposta vem vazia', () => {
    const text = parseOllamaChatResponse(JSON.stringify({ message: { content: '   ' }, done: true }));
    assert.equal(text, null);
  });

  it('aceita fallback response do endpoint generate', () => {
    const text = parseOllamaChatResponse(JSON.stringify({ response: 'resposta ok' }));
    assert.equal(text, 'resposta ok');
  });

  it('lança erro quando payload contém error', () => {
    assert.throws(
      () => parseOllamaChatResponse(JSON.stringify({ error: "model 'x' not found" })),
      /model 'x' not found/,
    );
  });
});

describe('parseOllamaErrorBody', () => {
  it('extrai mensagem de erro da API', () => {
    assert.equal(
      parseOllamaErrorBody(JSON.stringify({ error: "model 'qwen2.5:0.5b' not found" })),
      "model 'qwen2.5:0.5b' not found",
    );
  });
});

describe('modelIsInstalled', () => {
  it('detecta modelo instalado', () => {
    assert.equal(
      modelIsInstalled({ models: [{ name: 'qwen2.5:0.5b' }] }, 'qwen2.5:0.5b'),
      true,
    );
  });

  it('detecta ausência do modelo', () => {
    assert.equal(
      modelIsInstalled({ models: [{ name: 'llama3.1:8b' }] }, 'qwen2.5:0.5b'),
      false,
    );
  });
});

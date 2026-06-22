# Estrutura de memória — Mobi

Este documento define os tipos de memória que sustentam contexto, continuidade e qualidade de decisão do agente.

---

## 1) Memória da empresa

Finalidade: manter fatos institucionais estáveis da Moble para respostas consistentes e operação comercial alinhada.

### Campos

- `nome`
- `serviços`
- `regiões atendidas`
- `processo comercial`
- `prazos`
- `materiais/linhas`
- `garantia`
- `política de pagamento`
- `regras internas`

### Modelo sugerido (JSON)

```json
{
  "nome": "Moble Marcenaria",
  "serviços": [],
  "regiões atendidas": [],
  "processo comercial": "",
  "prazos": "",
  "materiais/linhas": [],
  "garantia": "",
  "política de pagamento": "",
  "regras internas": []
}
```

---

## 2) Memória do usuário

Finalidade: personalizar o apoio ao operador/dono, respeitando estilo de trabalho e prioridades reais.

### Campos

- `preferências de resposta`
- `estilo de decisão`
- `projetos em andamento`
- `prioridades`
- `tarefas recorrentes`

### Modelo sugerido (JSON)

```json
{
  "preferências de resposta": "",
  "estilo de decisão": "",
  "projetos em andamento": [],
  "prioridades": [],
  "tarefas recorrentes": []
}
```

---

## 3) Memória por cliente

Finalidade: acompanhar relacionamento comercial ponta a ponta, evitando perda de contexto e retrabalho no atendimento.

### Campos

- `nome`
- `contato`
- `origem do lead`
- `interesse`
- `estágio`
- `orçamento estimado`
- `necessidades`
- `objeções`
- `histórico resumido`
- `pendências`
- `próximo passo`

### Modelo sugerido (JSON)

```json
{
  "nome": "",
  "contato": "",
  "origem do lead": "",
  "interesse": "",
  "estágio": "",
  "orçamento estimado": "",
  "necessidades": [],
  "objeções": [],
  "histórico resumido": "",
  "pendências": [],
  "próximo passo": ""
}
```

---

## 4) Memória de conversa

Finalidade: registrar o estado atual de cada conversa para continuidade imediata, sem reinício de contexto.

### Formato

- `resumo`
- `fatos confirmados`
- `decisões tomadas`
- `pendências`
- `próxima ação`

### Modelo sugerido (JSON)

```json
{
  "resumo": "",
  "fatos confirmados": [],
  "decisões tomadas": [],
  "pendências": [],
  "próxima ação": ""
}
```

---

## Diretrizes de uso

- Atualizar memórias com base em fatos observáveis na conversa.
- Evitar duplicidade: preferir atualização incremental ao invés de criar novo registro para o mesmo contexto.
- Registrar incertezas explicitamente quando houver lacuna de dados.
- Priorizar memória de conversa para continuidade imediata e memória por cliente para evolução comercial.

*Etapa 3 — Estrutura de memória.*

# TechPulse Backend - Keep-Alive Endpoint Implementation

## Resumo

Implementação do endpoint público `GET /keep-alive` para keep-alive do Render via UptimeRobot.

---

## O que foi alterado

### 1. Novo Decorator: `@Public()`
**Arquivo:** `src/common/decorators/public.decorator.ts`

```typescript
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

Permite marcar rotas específicas como públicas, ignorando o `SecurityGuard` global.

### 2. SecurityGuard Atualizado
**Arquivo:** `src/common/guards/security.guard.ts`

- Injeção do `Reflector` para ler metadados
- Verificação de `IS_PUBLIC_KEY` no handler e na classe do controller
- Se `isPublic === true`, permite acesso sem `X-App-Key` nem `User-Agent` específico

### 3. Novo Controller: KeepAliveController
**Arquivo:** `src/health/keep-alive.controller.ts`

```typescript
@Controller('keep-alive')
export class KeepAliveController {
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  keepAlive() {
    return { status: 'ok' };
  }
}
```

- Rota: `GET /keep-alive`
- Decorator `@Public()` aplica exceção apenas a esta rota
- Resposta mínima: `{ "status": "ok" }`
- HTTP 200
- Sem lógica pesada, sem acesso a banco/cache, sem chamadas externas

### 4. HealthModule Atualizado
**Arquivo:** `src/health/health.module.ts`

Adicionado `KeepAliveController` aos controllers do módulo.

### 5. Testes E2E
**Arquivo:** `src/health/keep-alive.controller.spec.ts`

Testes cobrindo:
1. ✅ `GET /keep-alive` sem `X-App-Key` → HTTP 200
2. ✅ `GET /keep-alive` sem `User-Agent` TechPulse → HTTP 200
3. ✅ Resposta contém apenas `{ "status": "ok" }`
4. ✅ `/health` continua exigindo autenticação (401 sem credenciais)
5. ✅ `/news` continua exigindo autenticação (401 sem credenciais)
6. ✅ Rate limiting global (ThrottlerGuard) continua aplicado (documentado)
7. ✅ Nenhuma chamada externa executada (endpoint retorna imediatamente)

---

## Como a rota foi protegida/aberta

### Abordagem: Metadata + Reflector (Padrão NestJS Idiomático)

1. **Decorator `@Public()`** define metadado `isPublic: true` na rota
2. **SecurityGuard** usa `Reflector.getAllAndOverride()` para verificar:
   - Primeiro no handler (método)
   - Depois na classe (controller)
3. Se `true`, retorna `true` imediatamente (permite acesso)
4. Caso contrário, executa validação completa de `X-App-Key` e `User-Agent`

### Por que esta abordagem é segura

| Aspecto | Implementação |
|---------|--------------|
| **Escopo** | Apenas rotas explicitamente marcadas com `@Public()` |
| **Granularidade** | Nível de método (handler) ou classe (controller) |
| **Risco de vazamento** | Zero - rotas existentes não afetadas |
| **Auditoria** | Claro no código: `@Public()` visível no controller |
| **Reversibilidade** | Remover decorator restaura proteção total |

---

## Análise de Segurança

### ✅ Riscos Mitigados

1. **Não expõe `/health`** - Continua protegido por `SecurityGuard`
2. **Não expõe `/news`** - Continua protegido por `SecurityGuard`
3. **Não expõe `/docs` (Swagger)** - Protegido por `SecurityGuard`
4. **Rate limiting ativo** - `ThrottlerGuard` global aplica 30 req/min/IP
5. **Sem side effects** - Endpoint não altera estado, não consulta recursos
6. **Sem vazamento de info** - Resposta fixa `{ "status": "ok" }`
7. **UptimeRobot compatível** - Funciona sem headers customizados

### ⚠️ Riscos Residuais (Aceitáveis)

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| DDoS via `/keep-alive` | Baixa | Baixo | ThrottlerGuard (30 req/min/IP) |
| Enumeração de endpoint público | Média | Muito Baixo | Endpoint documentado, resposta mínima |
| Bypass acidental de outras rotas | Zero | N/A | Apenas `@Public()` explicitamente aplicado |

---

## Testes Executados

```
Test Suites: 5 passed, 5 total
Tests:       78 passed, 78 total
```

### Detalhamento dos Testes de Keep-Alive

| Teste | Resultado |
|-------|-----------|
| GET /keep-alive sem X-App-Key → 200 | ✅ PASS |
| GET /keep-alive sem User-Agent TechPulse → 200 | ✅ PASS |
| Resposta contém apenas `{ "status": "ok" }` | ✅ PASS |
| GET /health sem credenciais → 401 | ✅ PASS |
| GET /health com X-App-Key inválido → 401 | ✅ PASS |
| GET /health com User-Agent inválido → 401 | ✅ PASS |
| GET /news sem credenciais → 401 | ✅ PASS |
| GET /news com credenciais inválidas → 401 | ✅ PASS |
| Rate limiting documentado como ativo | ✅ PASS |
| Sem chamadas externas | ✅ PASS |

---

## Build

```
> nest build
✅ Compilação bem-sucedida
```

---

## Confirmações Finais

- ✅ `/keep-alive` acessível publicamente (sem `X-App-Key`, sem `User-Agent` específico)
- ✅ `/health` continua protegido (requer `X-App-Key` + `User-Agent`)
- ✅ `/news` continua protegido (requer `X-App-Key` + `User-Agent`)
- ✅ `ThrottlerGuard` global aplica rate limiting a `/keep-alive` (30 req/60s/IP)
- ✅ Nenhuma alteração em `/health`, `/news`, `/docs`, cache, autenticação
- ✅ Nenhuma dependência adicionada
- ✅ Build e testes passam

---

## Arquivos Modificados/Criados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/common/decorators/public.decorator.ts` | **Novo** | Decorator `@Public()` para rotas públicas |
| `src/common/guards/security.guard.ts` | **Modificado** | Verifica metadado `isPublic` via `Reflector` |
| `src/health/keep-alive.controller.ts` | **Novo** | Controller com endpoint `GET /keep-alive` |
| `src/health/health.module.ts` | **Modificado** | Registra `KeepAliveController` |
| `src/health/keep-alive.controller.spec.ts` | **Novo** | Testes E2E completos |

---

## Limitações Conhecidas

1. **Teste de rate limiting real** - Em ambiente de teste o `ThrottlerGuard` é sobrescrito para isolamento. Em produção, o guard global aplica o limite configurado (30 req/min/IP).
2. **HEAD /keep-alive** - Não implementado (requisito pede apenas GET). Se necessário, adicionar `@Head()` no controller.
3. **Logs de acesso** - Não há logging específico para `/keep-alive`. Se necessário, adicionar interceptor ou middleware.
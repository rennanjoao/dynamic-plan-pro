## Adicionar "Esqueci minha senha"

Hoje `/auth` e `/admin-login` só têm e-mail + senha + Entrar. Não há fluxo de recuperação.

## Mudanças

### 1. Nova página `src/pages/ResetPassword.tsx`
- Rota pública.
- Detecta o `type=recovery` no hash da URL (Supabase já cria a sessão de recuperação automaticamente após o clique no link do e-mail).
- Form com nova senha + confirmação → chama `supabase.auth.updateUser({ password })`.
- Sucesso → `toast` + `navigate("/auth")`.
- Mesma estética glassmorphism do `Auth.tsx` (gradient-hero, glass-strong, glow-primary).

### 2. `src/App.tsx`
- Adicionar `<Route path="/reset-password" element={<ResetPassword />} />` (pública, antes do `*`).

### 3. `src/pages/Auth.tsx`
- Adicionar link/botão **"Esqueci minha senha"** abaixo do botão Entrar.
- Ao clicar: alterna o card para um modo "recuperação" (state local `mode: "login" | "recover"`) com um único campo de e-mail e botão "Enviar link".
- Submit chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${window.location.origin}/reset-password })`.
- `toast.success("Enviamos um link de redefinição para seu e-mail")` e volta para o modo login.
- Link "Voltar ao login" no modo recuperação.

### 4. `src/pages/AdminLogin.tsx`
- Mesmo padrão: link "Esqueci minha senha" abaixo do botão, com modo recuperação inline reaproveitando o mesmo fluxo `resetPasswordForEmail`.

## Fora de escopo

- Não criar templates customizados de e-mail (o Lovable Cloud já envia o e-mail padrão de recuperação).
- Não mexer em RLS, billing, alertas, coach panel, anamnese.

## Verificação

- `bunx tsc --noEmit` limpo.
- Em `/auth`, clicar em "Esqueci minha senha" → form de e-mail → submit → toast de sucesso.
- E-mail chega com link → ao abrir, vai para `/reset-password` → define nova senha → consegue logar.
- Mesmo fluxo funciona em `/admin-login`.

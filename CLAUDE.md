# Regras do repositório

- **Toda ação vai para produção.** Ao terminar qualquer mudança pedida, rode `npx tsc --noEmit -p .`, faça o commit na `main`
  e o `git push origin main` sem perguntar antes. A Vercel publica a `main` em https://skillertri.vercel.app.
  Se a checagem de tipos falhar, corrija antes de subir; nunca suba com erro.
- Mensagens de commit em português, no estilo dos commits existentes.
- `.env.local` aponta para o Postgres de produção: não altere dados existentes (em especial respostas) sem pedido explícito.
- Mais de uma sessão pode estar editando esta pasta ao mesmo tempo: no commit, adicione só os arquivos que você mudou
  (`git add <arquivos>`), nunca `git add -A`.

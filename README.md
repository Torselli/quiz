# 汉字练习 — Treino de Ideogramas Chineses

Webapp estático (HTML/CSS/JS puro, sem build e sem servidor) para treinar
ideogramas chineses a partir de uma tabela CSV com três colunas:

```
ideograma,pronuncia,traducao
你好,nǐ hǎo,olá
谢谢,xièxiè,obrigado
```

A primeira linha pode ser um cabeçalho (é detectada automaticamente) ou já
pode começar com dados.

## Como funciona o quiz

A cada pergunta, o app sorteia:
1. uma palavra do seu banco de dados;
2. **qual das três colunas será mostrada** como pergunta (ideograma,
   pronúncia ou tradução);
3. **qual das duas colunas restantes** você precisa acertar;
4. 4 opções de resposta (1 certa + 3 erradas sorteadas do restante do
   banco).

Há também um modo "Só as que erro mais", que filtra o quiz apenas para as
palavras em que você já errou pelo menos uma vez — útil para reforço.

Os dados (palavras e estatísticas de acerto/erro) ficam salvos no
`localStorage` do navegador, ou seja, só naquele dispositivo/navegador.
Use o botão **Exportar CSV** de vez em quando para manter uma cópia de
segurança ou para levar seus dados para outro dispositivo (importe o
arquivo exportado lá).

## Como hospedar no GitHub Pages

1. Crie um repositório novo no GitHub (ex.: `hanzi-quiz`).
2. Envie os arquivos deste projeto (`index.html`, `style.css`,
   `script.js`, `sample.csv`) para a raiz do repositório:
   ```
   git init
   git add .
   git commit -m "Treino de ideogramas chineses"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/hanzi-quiz.git
   git push -u origin main
   ```
3. No GitHub, vá em **Settings → Pages**.
4. Em "Build and deployment", escolha **Deploy from a branch**, selecione
   a branch `main` e a pasta `/ (root)`.
5. Salve. Em alguns minutos o app estará disponível em
   `https://SEU-USUARIO.github.io/hanzi-quiz/`.

Não é necessário nenhum backend, banco de dados ou processo de build —
é só abrir o `index.html` (localmente ou publicado) e importar seu CSV.

## Testar localmente

Basta abrir o `index.html` num navegador. Se o seu navegador bloquear o
carregamento de arquivos locais via `file://`, rode um servidor simples
na pasta do projeto, por exemplo:

```
python3 -m http.server 8000
```

e acesse `http://localhost:8000`.

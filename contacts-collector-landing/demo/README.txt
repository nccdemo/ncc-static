Contacts Collector — cartella demo
====================================

ESEGUIBILE (o zip) nella stessa cartella della landing
--------------------------------------------------------
1. Copia il file qui dentro, ad esempio:
   contacts-collector-landing\demo\ContactsCollector-Demo.exe
   oppure uno zip: demo\ContactsCollector-Demo.zip

2. Apri il file accanto (nella cartella superiore):
   contacts-collector-landing\demo-config.js

3. Imposta "fileName" con il nome ESATTO del file, es.:
   fileName: "ContactsCollector-Demo.exe"
   oppure:
   fileName: "ContactsCollector-Demo.zip"

4. Ricarica la pagina index.html (meglio da un piccolo server locale o da hosting,
   non da file:// se il browser blocca i download).

Note
----
- .exe: Chrome/Edge possono segnalare "download pericoloso" per file eseguibili.
  Spesso si usa uno .zip che contiene l'exe.
- File molto grandi: valuta hosting/CDN; Git può rifiutare file oltre certe dimensioni.

Git
---
Nella root del repo, .gitignore esclude demo/*.exe e demo/*.zip (file grandi).
In locale lo zip resta in questa cartella; in pubblicazione copia anche
PalermoBusinessAgent.zip sul server insieme a index.html.

PayPal: vedi ../paypal-config.js

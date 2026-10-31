# apolloDJ — Refinamento: limpar simulações · pastas workspace · drop→análise · barra de título no login

**Data:** 2026-06-03
**Root ativo:** `src_002/`
**Shell alvo:** `theme/screen software/apolloDJ.v3.html` (+ módulos `v1/`, `v2/`, `v3/`) e bridges Python em `apollodj/`
**Fontes de verdade dos fluxos:** `mapped.md` (§4 pipeline, §4.5 storage layout, §5 routing), `apolloDJ-flowchart.md` (Page 1 "DROP on playlist target → ImportQueue → … → Coletânea", Page 4)

---

## 1. Contexto e problema

O shell mostra **números fabricados** em relatórios/painel mesmo sem nenhuma faixa processada ("reports with tons of numbers when never runned nothing inside"). Os botões **"+"** das seções *Computador* e *Playlists* existem visualmente mas **não têm handler**. O drag-drop para playlist apenas atualiza um índice em memória + toast, **sem rodar análise**. A tela de **login** não tem barra de título nem botão de fechar (a janela é `frameless`, então não há como fechar antes de logar).

## 2. Objetivos (o que esta entrega faz)

1. **Remover todos os dados simulados** dos relatórios e da biblioteca; mostrar estado vazio (`—` / "Sem dados ainda") até existir biblioteca real, e então conectar com dados ao vivo.
2. **Botão "+" em Computador**: abre seletor de pasta nativo → adiciona a pasta como *workspace* (persistida) → escaneia e lista os arquivos de áudio **reais** dela na tabela, prontos para arrastar.
3. **Botão "+" em Playlists**: cria **playlist** ou **grupo** (persistidos). Arrastar uma faixa (de uma pasta workspace) para qualquer playlist/grupo dispara **análise automática** (cópia não-destrutiva → renomeação canônica → salva em `~/apolloDJ/Tracks/Coletânea`) e adiciona a faixa resultante à playlist.
4. **Barra de título no login/splash**: exibir a barra `#shell-chrome` (título apolloDJ + minimizar/maximizar/fechar) também durante `apollo-auth-stage`.

## 3. Decisões aprovadas pelo usuário

| Ponto | Decisão |
|------|---------|
| Relatórios/Painel | Vazios (`—` / "Sem dados ainda") até haver biblioteca; depois conectar com dados reais derivados do filesystem/logs. **Sem percentuais/deltas fabricados.** |
| "+" Computador | Seletor de pasta + escanear + listar arquivos de áudio reais automaticamente. |
| Drop → análise | **Cópia** (mantém o original no lugar). ApolloDJ trabalha com a cópia em `~/apolloDJ/Tracks/Coletânea`. |
| Barra no login | Barra de título completa (minimizar, maximizar, fechar) já na tela de login/splash. |
| Persistência (default) | Pastas workspace + playlists/grupos + membership gravados em `Configurações/preferences.json` via `conf/preferences.py`. (O `xml_db`/`coletanea.aprio.xml` mais pesado fica fora de escopo — ver §11.) |

## 4. Abordagem arquitetural

Tudo se conecta ao **caminho de ingestão v1 já existente** — `ingest/watcher.process_file` → `ingest/dj_prep_pro.prep(commit=False)` → `ingest/pipeline.run(commit=True)`. Esse caminho **já é não-destrutivo**: `process_file` faz `shutil.copy2` do arquivo de origem para `Tracks/0. Em Análise` antes de qualquer coisa, então roda a cadeia completa (trim → headroom → loudness → BPM/Key → hotcues → rename canônico → roteamento `Coletânea`/`Duvidosos` → sidecar `.apollodj.json`). O arquivo original **nunca** é apagado. Isso satisfaz exatamente a decisão "Cópia (manter original)".

**Não** vamos construir o `pipeline_v2` (ImportQueue/ProcessPool/state_machine/xml_db) descrito em `mapped.md §4.1` — ele existe mas é overkill para este pedido (YAGNI). O caminho v1 entrega copy→analyze→rename→Coletânea de forma comprovada.

### 4.1 Modelo de dados do front (tabela biblioteca)

A tabela `biblio` é alimentada por `window.T` (array) via `trackRows()` (`v1/shared.js`). Duas origens de linhas:

- **Arquivo local de workspace** (ainda não analisado): objeto em `T` com `_srcPath` (caminho absoluto na máquina) e `_local: true`. Campos `bpm/key/q` ficam vazios/`—`.
- **Faixa da biblioteca** (já em Coletânea): objeto em `T` com `_libPath` (caminho absoluto em Coletânea) e `_analyzed: true`, campos preenchidos a partir do sidecar.

A seleção de um nó *Computador* repopula `T` com `scan_folder(path)`. A seleção de *Todas as faixas* / uma playlist repopula `T` com `list_library()` (filtrado pela membership da playlist).

### 4.2 Fluxo do drop (coração da entrega)

```
arrastar linha da tabela ──► soltar sobre .target-playlist / grupo
        │
        ├─ T[idx]._local === true  ──►  pyBridge.ingest_track(T[idx]._srcPath)
        │        (copy → prep → pipeline.run(commit) → Coletânea)            │
        │        retorna { ok, final_path, track }                          │
        │        ► adiciona final_path à membership da playlist (persist)   │
        │        ► toast progresso: "Analisando… → Pronto: <nome>"          │
        │
        └─ T[idx]._analyzed === true ──► só adiciona _libPath à playlist (persist)
```

Erros de ingestão (`ok:false`) → toast de erro pt-BR, faixa **não** entra na playlist.

## 5. Componentes detalhados

### 5.1 Limpeza de dados simulados

- **`theme/screen software/v1/relatorios.js`** — remover o objeto `modules` com números hardcoded (`142/128/847…` × `periods[].mult`). Passar a renderizar a partir de `pyBridge.get_report_stats(period, module)`. Métricas sem fonte real ⇒ `—`. Estado vazio quando biblioteca = 0: faixa única "Sem dados ainda — processe faixas para ver relatórios.".
- **`theme/screen software/v2/coletanea-lib.js`** — remover os nós hardcoded de *Computador* (`C:\Users\User\Music`, `Downloads`, `Desktop`, `Disco local (D:)`, `D:\Music`) e a árvore fake de *Playlists* (`Grupo de playlists 1/2`, `Playlist A–G` + contadores). Renderizar *Computador* a partir de `workspace_folders` (prefs) e *Playlists* a partir de `playlist_store` (prefs). Instalação nova = seções vazias com os 4 cabeçalhos canônicos (`Favoritas`, `Todas as faixas`, `Grupos de playlists`, `Playlists`).
- **`theme/screen software/apolloDJ.v2.html`** — zerar o `VIEWS_IDX` populado (linha ~1250) para `{all:null,favorites:[]}` (consistência; v2 é fallback). `v3.html` e `v1/shared.js` já estão limpos.
- **`theme/screen software/v1/inicio.js`** — os 4 tiles já mostram `—`; conectar **Faixas** (= contagem da biblioteca) e **Espaço usado** (= bytes em Coletânea) e **Pendrives** (= registrados) a `get_report_stats`; **Sessões** permanece `—` (sem fonte real ainda).

### 5.2 Workspace folders — "+" em Computador

- Handler no ícone `.sl-acts .ri-add-line[title="Adicionar pasta"]` (seção `#aside-top`):
  1. `path = await pyBridge.open_folder_dialog()` (já existe em `launcher.py`).
  2. Se vazio/cancelado → nada.
  3. Carregar `workspace_folders` das prefs, dar `push(path)` se não existir, salvar.
  4. Re-renderizar a árvore *Computador* e selecionar o novo nó (que dispara `scan_folder`).
- Cada nó *Computador* (`.tree-node[data-ws-path]`) ao ser clicado: `T = (await pyBridge.scan_folder(path)).tracks` mapeado para o shape de `T`; `DataTable.render('biblio')`.
- Ícone `.ri-more-2-line` da seção: menu pequeno com **Remover pasta** (tira de `workspace_folders`, persiste, re-render).
- Filtro de extensão de `biblioteca-tree-ext.js` (`.wav/.aiff/.flac/.mp3`) continua válido.

### 5.3 Playlists/grupos — "+" em Playlists + drop

- Handler no ícone `.sl-acts .ri-add-line[title="Nova playlist"]` (seção `#aside-mid`): abre menu **Nova playlist** / **Novo grupo** → prompt de nome (input inline no padrão do app) → grava em `playlist_store` → re-render.
- `playlist_store` (ver §6) define grupos, playlists e membership. A árvore é renderizada a partir dele; contadores (`.ct`) = `tracks.length` reais.
- **`theme/screen software/v3/biblioteca-dnd.js`** — reescrever `dropOnPlaylist(pl, meta)`:
  - resolver `t = window.T[meta.rowIdx]`.
  - se `t._local`: chamar `pyBridge.ingest_track(t._srcPath)`; on success adicionar `final_path` à membership da playlist alvo (por caminho absoluto de Coletânea), persistir, atualizar `.ct`, toast. on failure toast de erro.
  - se `t._analyzed`: adicionar `t._libPath` à membership, persistir, atualizar `.ct`, toast.
  - manter o drop em deck (`dropOnDeck`) inalterado.
  - `addTrackToPlaylist` passa a operar sobre `playlist_store` (chave = caminho absoluto), não mais sobre `VIEWS_IDX` numérico.
- **`theme/screen software/v3/biblioteca-tree-ext.js`** — `ensurePlaylistSections` continua garantindo os 4 cabeçalhos; sem alterar lógica de injeção (idempotente).

### 5.4 Barra de título no login/splash

- **`theme/screen software/v3/shell-chrome.css`**:
  - Trocar `body.apollo-auth-stage #shell-chrome { display:none !important; }` por `display:flex !important;`.
  - Garantir fixação no topo durante auth: `#shell-chrome { position: fixed; top:0; left:0; right:0; z-index:10000; }` (login é `position:fixed; inset:0; z-index:9998`, então a barra pinta por cima dos 32px superiores).
  - `body.apollo-auth-stage #login-screen, body.apollo-auth-stage #splash { padding-top: 32px; }` (ou ajustar `inset: 32px 0 0 0`) para o conteúdo não ficar sob a barra. **Verificar visualmente** que logo/box do login continuam centralizados.
- **`theme/screen software/v3/shell-chrome.js`** — `init()` já chama `bindChromeButtons()` independente do estágio; os bridges `window_minimize/maximize/toggle_maximize/close` já existem em `launcher.py`. `mergeTopbarIntoChrome()` continua só no `activateDesktopChrome()` (pós-login). Nenhuma mudança de lógica necessária além de garantir que `bindChromeButtons` rode no estágio de auth (já roda).

### 5.5 Novos métodos de bridge (Python)

Adicionar à classe `ApolloApi` em **`apollodj/installer_ui/launcher.py`** e expô-los no `window.pyBridge` (lista injetada em `_inject_shell_boot`, junto de `get_user_preferences`, `open_folder_dialog`, etc.):

| Método | Retorno (JSON string) | Fonte |
|--------|----------------------|-------|
| `scan_folder(path)` | `{"ok":bool,"path":str,"tracks":[Track…],"error"?}` | filesystem (recursivo, cap) + mutagen opcional |
| `list_library()` | `{"ok":bool,"tracks":[Track…]}` | `Tracks/Coletânea` + sidecars `.apollodj.json` |
| `get_report_stats(period,module)` | `{"ok":bool,"rows":[{k,v,d,p}…],"empty":bool}` | contagens reais (Coletânea, Duvidosos, Pendrives, logs) |
| `ingest_track(path)` | `{"ok":bool,"final_path"?:str,"track"?:Track,"error"?}` | delega para `self.ingest.ingest_track` + lê sidecar resultante |

Lógica concreta num **novo módulo** `apollodj/ingest/library.py` (funções puras `scan_folder`, `list_library`, `report_stats`); os métodos da bridge são wrappers finos que serializam JSON. **Manter os audits verdes:** registrar `apollodj/ingest/library.py` em `registry.json` (dimensão "orphan files vs registry") e em `apolloDJ.spec` `hiddenimports` (dimensão "spec hiddenimports vs disk modules"). Nenhum uso de `__file__` no spec.

**Shape `Track` (JSON, comum às duas listagens):**
```json
{
  "path": "C:\\…\\arquivo.flac",
  "name": "arquivo.flac",
  "title": "", "artist": "", "comment": "",
  "ext": "FLAC", "duration": "06:12",
  "bpm": null, "key": null, "energy": null,
  "lufs": null, "quality": null, "date": "2026-06-03",
  "analyzed": false
}
```
`scan_folder` → `analyzed:false`, campos musicais `null` (ou tags do mutagen se houver). `list_library` → `analyzed:true`, campos preenchidos do sidecar. O front mapeia `path`→`_srcPath`/`_libPath` conforme `analyzed`.

`scan_folder`: recursivo com **cap de 5000 arquivos** e extensões `{.wav,.flac,.aif,.aiff,.mp3}`; ignora erros por arquivo; nunca lança (retorna `ok:false` + `error` em falha de pasta).

`report_stats`: métricas reais derivadas agora — `Faixas na biblioteca` (contagem Coletânea), `Aprovadas`/`Reprovadas` por subpasta de `2. Duvidosos`, `Pendrives registrados` (linhas de `pendrives-registrados.csv`), `Espaço usado` (soma de bytes em Coletânea). Janela por período usa `mtime` quando aplicável; métricas sem fonte → `null` → UI mostra `—`. `empty:true` quando biblioteca = 0.

## 6. Persistência (`Configurações/preferences.json`)

Acesso via `pyBridge.get_user_preferences()` / `set_user_preference(key, value_json)` (já existentes). Chaves novas:

```json
{
  "workspace_folders": ["C:\\Users\\User\\Music", "D:\\Sets"],
  "playlist_store": {
    "groups":    [{ "id": "g_ab12", "name": "Set Sábado" }],
    "playlists": [
      { "id": "p_cd34", "name": "Aquecimento", "group": "g_ab12",
        "tracks": ["C:\\Users\\User\\apolloDJ\\Tracks\\Coletânea\\Artist - Title - 128 - 8A.flac"] }
    ],
    "favorites": ["C:\\…\\Coletânea\\…"]
  }
}
```

- `id` gerado no front (`p_`/`g_` + random base36).
- Membership por **caminho absoluto de Coletânea** (chave estável após rename canônico).
- Helper JS `ApolloStore` (novo, em `v1/shared.js` ou `v3`) encapsula load/save com cache em memória + flush para `set_user_preference`.

## 7. Estados vazios e cópia pt-BR

- Relatórios sem biblioteca: "Sem dados ainda — processe faixas para ver relatórios."
- Computador sem pastas: "Adicione uma pasta com o botão +".
- Playlists vazias: 4 cabeçalhos visíveis, sem filhos.
- Toasts de drop: `Analisando <nome>…` → `Pronto: <nome canônico>` (sucesso) | `Falha ao analisar <nome>` (erro) | `<playlist> — faixa já está na playlist`.
- Termos DJ em inglês mantidos (cue, hotcue, sync, track); restante pt-BR jovem.

## 8. Tratamento de erros

- Bridge ausente (preview HTTP sem pywebview): toda chamada `pyBridge.*` é protegida por `typeof … === 'function'`; sem bridge, seções aparecem vazias (sem simulação).
- `scan_folder`/`list_library`/`ingest_track` nunca lançam para o front; retornam `ok:false`+`error`.
- `ingest_track` falho → faixa não entra na playlist; toast de erro.
- JSON de prefs corrompido → `load_preferences` já retorna `{}` (fail-safe).

## 9. Verificação

**Gates (devem sair 0, como hoje):**
```
python smoke_verify.py
python _audit_001.py
python _audit_001_functional.py
```
(O novo `library.py` precisa estar em `registry.json` + `apolloDJ.spec` para o `_audit_001` continuar verde.)

**Manual (shell):** `cd src_002 && python main.py` não basta (só boot) — abrir o shell e checar:
1. Login mostra barra de título; botão **fechar** encerra a janela antes de logar.
2. "+" Computador abre seletor; pasta aparece e lista arquivos reais.
3. Arrastar um arquivo para uma playlist → toast de análise → arquivo aparece em `~/apolloDJ/Tracks/Coletânea`; original permanece no lugar; contador da playlist sobe.
4. Relatórios/Painel: sem números fabricados; mostram reais ou `—`.
5. Reabrir o app: pastas e playlists persistidas.

## 10. Arquivos tocados

**Python:** `apollodj/installer_ui/launcher.py` (4 métodos de bridge + mapeamento pyBridge), **novo** `apollodj/ingest/library.py`, `registry.json` (+módulo), `apolloDJ.spec` (+hiddenimport).
**JS:** `v2/coletanea-lib.js`, `v3/biblioteca-dnd.js`, `v1/relatorios.js`, `v1/inicio.js`, `v1/shared.js` (helper `ApolloStore` + mapeamento Track→T). Possível ajuste menor em `v3/biblioteca-tree-ext.js`.
**CSS/HTML:** `v3/shell-chrome.css` (barra no auth-stage), `apolloDJ.v3.html` (offset login/splash se necessário), `apolloDJ.v2.html` (zerar `VIEWS_IDX`).

## 11. Fora de escopo / futuro

- `pipeline_v2` (fila assíncrona, ProcessPool, state_machine, fingerprint dedup) e `xml_db`/`coletanea.aprio.xml`.
- Histórico temporal real para deltas/percentuais nos relatórios (hoje `—`).
- Export universal (Rekordbox/Serato/CDJ) — já existe noutro fluxo, não tocado.
- Subpastas expansíveis no nó *Computador* (listagem é recursiva achatada, com cap).
- Edição/renome/remoção de playlists além de criar (criar + adicionar faixa cobre o pedido).

## 12. Riscos

- **Audits**: esquecer de registrar `library.py` em `registry.json`/`apolloDJ.spec` quebra `_audit_001`. Mitigação: passo explícito no plano.
- **Layout login**: a barra fixa pode cobrir o topo do `#splash`/`#login-screen`; mitigação: `padding-top:32px` no auth-stage + verificação visual.
- **Caminhos Windows**: paths com `\` e acentos (`Coletânea`) em JSON/URLs; usar JSON real (não template string) e caminhos absolutos como chave.
- **mutagen ausente** no scan: tags ficam vazias (degradação graciosa), não bloqueia listagem.

#!/usr/bin/env python3
"""Publica o site com todos os arquivos versionados.

Sem isto, o navegador guarda cada módulo por conta própria e continua
servindo a versão antiga depois de uma atualização — foi o que fez o
arrasto do quadro "não funcionar" mesmo já estando no ar.

Versionar só o index.html não bastava: os módulos são carregados por
import uns dos outros, e cada endereço é guardado separadamente. Aqui
todo endereço interno ganha o mesmo carimbo, então uma publicação
invalida o conjunto inteiro de uma vez.
"""

import pathlib
import re
import subprocess
import sys
import time

RAIZ = pathlib.Path(__file__).parent
VERSAO = time.strftime('%Y%m%d%H%M%S')

# `from './x.js'`, `from '../y/z.js'` e `import('./w.js')`
IMPORTE = re.compile(r"""(from\s+|import\()(['"])(\.\.?/[^'"]+?\.js)(\?v=[^'"]*)?(['"])""")
RECURSO = re.compile(r"""((?:href|src)=")([^"]+?\.(?:css|js|png))(\?v=[^"]*)?(")""")
BUSCA_JSON = re.compile(r"""(fetch\(['"])([^'"]+?\.json)(\?v=[^'"]*)?(['"])""")
# Imagens citadas dentro do código, como a logo da tela inicial.
IMAGEM_JS = re.compile(r"""(src:\s*['"])([^'"]+?\.png)(\?v=[^'"]*)?(['"])""")


def carimbar_js(caminho: pathlib.Path) -> bool:
    texto = caminho.read_text()
    novo = IMPORTE.sub(rf"\1\2\3?v={VERSAO}\5", texto)
    novo = BUSCA_JSON.sub(rf"\1\2?v={VERSAO}\4", novo)
    novo = IMAGEM_JS.sub(rf"\1\2?v={VERSAO}\4", novo)
    if novo != texto:
        caminho.write_text(novo)
        return True
    return False


def carimbar_html(caminho: pathlib.Path) -> None:
    texto = caminho.read_text()
    caminho.write_text(RECURSO.sub(rf"\1\2?v={VERSAO}\4", texto))


def main() -> int:
    mudados = 0
    for js in sorted(RAIZ.glob('js/**/*.js')):
        if carimbar_js(js):
            mudados += 1

    carimbar_html(RAIZ / 'index.html')

    # O service worker também precisa mudar de nome de cache, senão ele
    # entrega o que guardou antes.
    sw = RAIZ / 'sw.js'
    sw.write_text(re.sub(r"const CACHE = 'promac-[^']*'",
                         f"const CACHE = 'promac-{VERSAO}'",
                         sw.read_text()))

    print(f'versão {VERSAO} — {mudados} módulo(s) carimbado(s)')

    mensagem = sys.argv[1] if len(sys.argv) > 1 else f'Publicar versão {VERSAO}'
    subprocess.run(['git', 'add', '-A'], cwd=RAIZ, check=True)

    resultado = subprocess.run(['git', 'commit', '-q', '-m', mensagem], cwd=RAIZ)
    if resultado.returncode != 0:
        print('nada novo para commitar')

    subprocess.run(['git', 'push', '-q'], cwd=RAIZ, check=True)
    print('enviado ao GitHub Pages')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

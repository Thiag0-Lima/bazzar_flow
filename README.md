# Bazzar Flow

Sistema interno de gerenciamento de ordens de serviço (OS) e rastreamento de chão de fábrica para a **Bazzar Gráfica Expressa**.

---

## Objetivo do projeto

Eliminar falhas de comunicação entre os setores de **atendimento, criação, produção, embalagem e retirada**, garantindo:

- Sincronização em tempo real das etapas de fabricação
- Controle de permissões por perfil (RBAC)
- Painel Kanban visual do fluxo produtivo
- Controle de prateleira (Aging) com alertas por tempo
- Histórico completo de movimentações e entregas
- Rastreabilidade e auditoria de cada transição de status
- Acesso simultâneo por vários terminais na rede local

### Fluxo de status (MVP)

```
Fechamento → Criação → Produção → Balcão Produção → Embalagem → Pronto para Retirada → Entregue
```

### Perfis de usuário

| Perfil       | Principais permissões                                      |
|--------------|------------------------------------------------------------|
| **Criação**  | Fechamento → Criação → Produção                            |
| **Operador** | Produção ↔ Balcão Produção (e retorno para Criação)        |
| **Atendente**| Balcão Produção → Embalagem → Pronto + registro de retirada|
| **Admin**    | Acesso total + gestão de usuários                          |

---

## Stack técnica

| Camada        | Tecnologia                                      |
|---------------|-------------------------------------------------|
| Backend       | Python 3.12 + FastAPI + SQLAlchemy + SQLite     |
| Autenticação  | JWT (python-jose + passlib/bcrypt)              |
| Tempo real    | WebSockets                                      |
| Frontend      | HTML + CSS + JavaScript (Vanilla)               |
| Rede local    | Uvicorn (`--host 0.0.0.0`)                      |
| Serviço Windows | NSSM (inicialização automática)               |

---

## Estrutura de pastas

```
bazzar-flow/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── auth.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── orders.py
│   │   │   └── websocket.py
│   │   └── services/
│   │       └── aging.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── kanban.html
│   ├── balcao.html
│   ├── historico.html
│   ├── admin.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── auth.js
│       ├── nav.js
│       ├── websocket.js
│       ├── kanban.js
│       ├── balcao.js
│       ├── historico.js
│       └── admin.js
└── README.md
```

---

## 1. Como rodar localmente (desenvolvimento)

### Pré-requisitos

- Python 3.12+
- Git (opcional)
- Navegador moderno (Chrome, Edge, Firefox)

### Passo a passo (Windows)

Abra o **PowerShell** na pasta do projeto:

```powershell
cd C:\Users\SEU_USUARIO\Desktop\bazzar-flow
```

#### 1.1 Criar ambiente virtual

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

Se aparecer erro de política de execução:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\venv\Scripts\Activate.ps1
```

#### 1.2 Instalar dependências

```powershell
cd backend
pip install -r requirements.txt
pip install "bcrypt==4.0.1"
```

#### 1.3 Subir o servidor

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 1.4 Acessar

No navegador:

```
http://localhost:8000
```

> **Não use** `http://0.0.0.0:8000` — esse endereço não funciona no navegador.

### Usuários padrão (criados na primeira execução)

| Usuário     | Senha     | Perfil     |
|-------------|-----------|------------|
| `admin`     | `admin123`| Admin      |
| `atendente` | `123`     | Atendente  |
| `criacao`   | `123`     | Criação    |
| `operador`  | `123`     | Operador   |

### Limpar o banco local (recomeçar do zero)

```powershell
# Pare o servidor (CTRL+C) antes
del bazzar_flow.db
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 2. Instalação no servidor local (produção – rede da loja)

Use um computador que permaneça ligado (idealmente o **Windows Server** da empresa).

### 2.1 Instalar Python no servidor

1. Baixe Python 3.12 em: https://www.python.org/downloads/
2. Na instalação, marque **Add python.exe to PATH**
3. Confirme:

```powershell
python --version
```

### 2.2 Copiar o projeto

Copie a pasta do projeto para o servidor, por exemplo:

```
C:\Users\Administrator\Desktop\bazzar-flow
```

**Não copie** a pasta `venv` do PC de desenvolvimento.

- **Instalação nova:** não copie um banco de outro ambiente; o sistema cria um banco novo e os usuários padrão.
- **Servidor que já está em uso:** mantenha `backend\bazzar_flow.db` no mesmo lugar. Não apague, substitua ou copie por cima dele ao atualizar o código.

O caminho padrão do banco agora é resolvido a partir da pasta `backend`, independentemente da pasta de onde o servidor for iniciado. Se precisar guardar o banco em outro local, configure a variável de ambiente `BAZZAR_DATABASE_PATH` com o caminho absoluto do arquivo. Nesse caso, aponte-a para o banco existente antes de iniciar o serviço.

### 2.3 Criar ambiente e instalar dependências

```powershell
cd C:\Users\Administrator\Desktop\bazzar-flow
python -m venv venv
.\venv\Scripts\Activate.ps1
cd backend
pip install -r requirements.txt
pip install "bcrypt==4.0.1"
```

### 2.4 Verificar porta disponível

```powershell
netstat -ano | findstr ":8000"
```

Se não retornar nada, a porta **8000** está livre.

### 2.5 Liberar firewall

```powershell
New-NetFirewallRule -DisplayName "Bazzar Flow" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

### 2.6 Teste manual

```powershell
cd C:\Users\Administrator\Desktop\bazzar-flow
.\venv\Scripts\Activate.ps1
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

No servidor: `http://localhost:8000`  
Nos outros PCs: `http://IP_DO_SERVIDOR:8000`

Descubra o IP com:

```powershell
ipconfig
```

### 2.7 Inicialização automática (NSSM)

1. Baixe o NSSM: https://nssm.cc/download  
2. Extraia (ex.: `C:\nssm-2.24\nssm-2.24\win64`)

3. Instale o serviço (PowerShell **como Administrador**):

```powershell
cd C:\nssm-2.24\nssm-2.24\win64
.\nssm.exe install BazzarFlow
```

Preencha a janela:

| Campo              | Valor                                                                 |
|--------------------|-----------------------------------------------------------------------|
| Path               | `C:\Users\Administrator\Desktop\bazzar-flow\venv\Scripts\uvicorn.exe` |
| Startup directory  | `C:\Users\Administrator\Desktop\bazzar-flow\backend`                  |
| Arguments          | `app.main:app --host 0.0.0.0 --port 8000`                             |

4. Iniciar e configurar:

```powershell
.\nssm.exe start BazzarFlow
.\nssm.exe status BazzarFlow
Set-Service -Name BazzarFlow -StartupType Automatic
```

Status esperado: `SERVICE_RUNNING`

### Comandos úteis do serviço

```powershell
cd C:\nssm-2.24\nssm-2.24\win64
.\nssm.exe start BazzarFlow
.\nssm.exe stop BazzarFlow
.\nssm.exe restart BazzarFlow
.\nssm.exe status BazzarFlow
```

### Backup do banco de dados

Os dados ficam em:

```
...\backend\bazzar_flow.db
```

Faça uma cópia de segurança antes de atualizar o código. Pare o serviço primeiro para evitar copiar o banco enquanto ele está sendo escrito.

```powershell
Copy-Item "C:\Users\Administrator\Desktop\bazzar-flow\backend\bazzar_flow.db" "C:\Users\Administrator\Desktop\backup_bazzar_flow.db"
```

---

## 3. Publicar no GitHub

### 3.1 Preparar o projeto (na sua máquina)

O `.gitignore` da raiz já exclui bancos SQLite, backups, ambientes virtuais e arquivos `.env`. O banco de dados contém dados operacionais e **não deve ser enviado ao GitHub**.

### 3.2 Criar repositório no GitHub

1. Acesse https://github.com/new  
2. Nome sugerido: `bazzar-flow`  
3. Deixe **Private** (sistema interno da empresa)  
4. **Não** marque “Add a README” (você já tem um)  
5. Clique em **Create repository**

### 3.3 Enviar o código

No PowerShell, na pasta do projeto:

```powershell
cd C:\Users\SEU_USUARIO\Desktop\bazzar-flow

git init
git rev-parse --show-toplevel
```

Confirme que o último comando mostra exatamente a pasta do projeto. Se mostrar outra pasta (por exemplo, `C:\Users\SEU_USUARIO`), **não continue** nem adicione arquivos até corrigir a raiz do repositório.

```powershell
git add .
git commit -m "Initial commit - Bazzar Flow MVP"

git branch -M main
git remote add origin https://github.com/SEU_USUARIO/bazzar-flow.git
git push -u origin main
```

Substitua `SEU_USUARIO` pelo seu usuário do GitHub.

### 3.4 Atualizações futuras

Depois de alterar arquivos:

```powershell
git add .
git commit -m "Descrição da alteração"
git push
```

### 3.5 Clonar em outra máquina

```powershell
git clone https://github.com/SEU_USUARIO/bazzar-flow.git
cd bazzar-flow
python -m venv venv
.\venv\Scripts\Activate.ps1
cd backend
pip install -r requirements.txt
pip install "bcrypt==4.0.1"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> **Importante:** o GitHub guarda o código, não o banco SQLite. Uma clonagem nova cria um banco local novo; ela não recupera os dados do servidor. No servidor existente, o banco continua em `backend\bazzar_flow.db` durante atualizações de código, desde que esse arquivo não seja apagado ou substituído.

---

## 4. Atualizar o servidor após mudanças

1. Teste no PC de desenvolvimento.
2. Pare o serviço no servidor:
   ```powershell
   cd C:\nssm-2.24\nssm-2.24\win64
   .\nssm.exe stop BazzarFlow
   ```
3. Faça backup do banco conforme a seção **Backup do banco de dados**.
4. Copie apenas os arquivos do código (ou faça `git pull` se o servidor tiver o repositório). **Não apague nem substitua** `backend\bazzar_flow.db`.
5. Suba o serviço:
   ```powershell
   .\nssm.exe start BazzarFlow
   ```
6. Nos navegadores, use `CTRL + F5` para limpar cache do frontend.

---

## 5. Funcionalidades principais

- Login com JWT e controle de sessão
- Kanban com 6 colunas + drag-and-drop
- Movimentação bloqueada por perfil (frontend + backend)
- Painel de balcão com Aging (verde / amarelo / vermelho)
- Notificação de cliente e registro de retirada
- Histórico de entregas com busca e filtros por data
- Histórico de movimentações por OS (timeline)
- Exportação Excel (CSV) e PDF
- Administração de usuários (criar, ativar/desativar, reset de senha)
- WebSocket para atualização em tempo real entre terminais
- Acesso multiestação em rede local

---

## 6. Requisitos de rede

- Servidor e clientes na **mesma rede local** (mesmo roteador)
- Porta TCP **8000** liberada no firewall do servidor
- IP fixo ou reserva de DHCP no roteador (recomendado)

---

## 7. Segurança (observações do MVP)

- Senhas armazenadas com hash bcrypt (não reversível)
- Validação de permissões no **backend** a cada requisição
- Admin pode redefinir senha de qualquer usuário
- Recomendado: trocar `SECRET_KEY` em `auth.py` em produção
- Repositório GitHub em modo **Private**

---

## 8. Suporte e evolução

Alterações comuns e onde fazer:

| Necessidade                         | Arquivo principal              |
|-------------------------------------|--------------------------------|
| Mudar regras de movimentação        | `backend/app/routers/orders.py`|
| Mudar colunas do Kanban             | `frontend/js/kanban.js`        |
| Novo perfil de usuário              | `models.py` + Admin            |
| Ajustes visuais                     | `frontend/css/style.css`       |
| Novos campos na OS                  | `models.py` + `schemas.py`     |

---

## Licença / uso

Sistema de uso interno da **Bazzar Gráfica Expressa**.  
Não distribuir fora do ambiente da empresa sem autorização.
```
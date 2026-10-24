# 发布到 GitHub（首次上架 + 后续发版）

> **不想敲命令？** 直接看 [`上传到GitHub-一步一步.md`](./上传到GitHub-一步一步.md)，
> 那里是双击 bat、粘贴令牌就完事的版本，本文是它的手动/原理版。

> 当前仓库已在本地初始化并完成首次提交（commit `4b0103c`），只差推送到远端。

---

## 零、先确认能连上 GitHub（跳过这步可能全程失败）

命令行工具（`curl` / `git`）默认读 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量。这两个变量指向的代理
如果访问不了 GitHub，`git push` 就会一直超时——**即使浏览器能正常打开 GitHub 网页**，因为浏览器走的是系统代理，两者不是一回事。

先诊断：

```bash
curl -sS -m 10 -o /dev/null -w "%{http_code}\n" https://github.com
```

- 返回 `200` → 通了，跳过本节
- 返回 `000` → 超时，继续往下

如果系统里的代理可用、只是环境变量指错了端口，可以只对 GitHub 单独指定代理（不影响其他仓库）：

```bash
git config --global http.https://github.com/.proxy http://127.0.0.1:<你的端口>
git config --global https.https://github.com/.proxy http://127.0.0.1:<你的端口>
```

也可以完全不动 git 配置，让发布脚本自己走代理：

```bash
node scripts/publish-to-github.js --proxy http://127.0.0.1:<你的端口>
```

验证：

```bash
git ls-remote https://github.com/octocat/Hello-World.git HEAD
```

能打印出一串 commit id 就说明通了。

---

## 零之一、仓库现在的状态

本地已经是初始化好的 git 仓库，提交历史完整，**只差推送到远端**。

所以不用 `git init`、不用 `git add`，**从下面第 2 步开始做就行**。

### 最省事的三步（照抄）

```bash
# 1) 先去 https://github.com/new 建一个空的 public 仓库，名字叫 ledger-studio，什么都不要勾选
#    建完记下地址，形如 https://github.com/你的用户名/ledger-studio.git

# 2) 在项目目录里执行
cd <项目目录>/ledger-studio
git remote add origin https://github.com/你的用户名/ledger-studio.git
git branch -M main
git push -u origin main

# 3) 打标签（可选，但发 Release 需要）
git tag -a v1.1.4 -m "LST-v1.1.4"
git push origin v1.1.4
```

第 2 步会弹认证：

- 用户名：你的 GitHub 用户名
- 密码：**不是账号密码**，要填 Personal Access Token
  - 去 https://github.com/settings/tokens → Generate new token (classic)
  - 勾 `repo` 权限 → 生成 → 复制（只显示一次）

> 上面这套是手动版本。想省事就直接用 `scripts/上传到GitHub.bat`，同样的事它一次做完，
> 连仓库都会自动创建。

---

## 一、首次上架

### 步骤 1：在 GitHub 建空仓库

浏览器打开 https://github.com/new

| 字段 | 填什么 |
| --- | --- |
| Repository name | `ledger-studio` |
| Description | 档案台账工作台 —— 本地运行的台账检查与生成工具 |
| 可见性 | Public（工具类项目建议公开，也便于别人提 issue）或 Private 都行 |
| Initialize this repository with | **全部不要勾**（README / .gitignore / LICENSE 本地已有） |

创建后拿到仓库地址，形如 `https://github.com/你的用户名/ledger-studio.git`。

### 步骤 2：关联远端并推送

```bash
cd ledger-studio

git remote add origin https://github.com/你的用户名/ledger-studio.git
git branch -M main
git push -u origin main
```

首次推送会要求认证。GitHub 早已不支持账号密码，要用 **Personal Access Token**：

1. https://github.com/settings/tokens → Generate new token (classic)
2. 勾选 `repo` 权限
3. 生成后复制（只显示一次）
4. 推送时用户名填 GitHub 用户名，**密码位置粘贴这个 token**

> 想省事可以装 GitHub CLI：
> ```bash
> winget install GitHub.cli
> gh auth login          # 浏览器授权，自动配好凭证
> gh repo create ledger-studio --public --source=. --push
> ```
> 一条命令建库 + 推送，还免去手动管 token。
> 本次开发环境没有 `gh`，所以下面给的还是手动流程。

### 步骤 3：打标签 + 发 Release

```bash
git tag -a v1.0.0 -m "LST-v1.0.0 首个公开版本"
git push origin v1.0.0
```

然后打开 `https://github.com/你的用户名/ledger-studio/releases/new`：

- Tag 选 `v1.0.0`
- 标题：`LST-v1.0.0`
- 说明：从 `CHANGELOG.md` 复制对应段落
- 上传附件：`dist/ledger-studio-v1.0.0.zip`

---

## 二、后续每次发版

### 步骤 1：改版本号（四处，缺一不可）

| 文件 | 改什么 |
| --- | --- |
| `package.json` | `version`、`docNo` |
| `assets/app.js` | `APP_DOC_NO` |
| `assets/engine/engine.js` | `ENGINE_DOC_NO`（引擎有变动才改） |
| `version.json` | `version`、`docNo`、`notes`、`releasedAt` |

### 步骤 2：更新 CHANGELOG

在 `CHANGELOG.md` 顶部按现有格式加一节：

```markdown
## LST-v1.0.1 · 2026-11-02
### 修复
- 某某问题
```

### 步骤 3：验证

```bash
node test/run-tests.js          # 必须全绿
node scripts/print-version.js   # 确认档号已改
```

### 步骤 4：提交 + 打标签 + 推送

```bash
git add -A
git commit -m "fix: xxx (LST-v1.0.1)"
git tag -a v1.0.1 -m "LST-v1.0.1"
git push origin main --tags
```

### 步骤 5：发 Release

同上，上传新的 zip。

**关键**：Release 的附件地址是稳定的 `/releases/latest/download/<文件名>`，所以工具内置的更新检查可以固定用这个路径，不用跟着版本号改。

---

## 三、推送失败怎么办

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `Authentication failed` | 用了账号密码 | 改用 Personal Access Token |
| `Support for password authentication was removed` | 同上 | 同上 |
| `remote: Repository not found` | 地址错或 token 无 repo 权限 | 核对地址、重发 token |
| `Updates were rejected` | 远端有本地没有的提交 | `git pull --rebase origin main` 后重推 |
| `Failed to connect ... 443` | 网络不通 | 见 `更新与镜像指南.md`，或配代理 `git config --global http.proxy http://127.0.0.1:端口` |

---

## 四、如果只能在内网操作

公司电脑连不上 GitHub 时，走这条路：

1. 在**能上网的机器**上完成上面的推送
2. 同一台机器加内网远端并推一份：
   ```bash
   git remote add mirror http://内网git地址/团队/ledger-studio.git
   git push mirror main --tags
   ```
3. 内网机器 `git clone http://内网git地址/...`，以后只用 `git pull`

详见 `内网环境使用指南.md`。

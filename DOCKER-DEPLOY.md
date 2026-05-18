# hxxpdfcraft Docker 部署指南

本文档说明如何在 Ubuntu 上使用 Docker，从 GitHub 拉取最新代码构建并部署 hxxpdfcraft。容器内由 Nginx 在 **3000** 端口提供静态站点；**宿主机 Nginx 由你自行配置**，用于 HTTPS、域名与反向代理。

## 架构说明

```
用户浏览器
    ↓
宿主机 Nginx（HTTPS / 域名，自行配置）
    ↓  proxy_pass
127.0.0.1:3000  或  hxxnet 网络内 hxxpdf:3000
    ↓
Docker 容器 hxxpdf（Nginx 监听 3000，提供 out/ 静态文件）
```

| 组件 | 说明 |
|------|------|
| `Dockerfile.deploy` | 多阶段构建：克隆 GitHub → `npm run build` → Nginx 镜像 |
| `docker-compose.deploy.yml` | 创建 `hxxnet` 网络，映射 `3000:3000`，容器名 `hxxpdf` |
| 宿主机 Nginx | 反代、SSL、域名；需配置 WASM 相关安全头（见下文） |

## 相关文件

| 文件 | 作用 |
|------|------|
| [Dockerfile.deploy](./Dockerfile.deploy) | 构建镜像 |
| [docker-compose.deploy.yml](./docker-compose.deploy.yml) | 编排服务与网络 |
| [nginx.conf](./nginx.conf) | 容器内 Nginx 配置（构建时从仓库复制） |
| [security-headers.conf](./security-headers.conf) | COOP/COEP 等头（WASM 必需） |

## 前置条件

- Ubuntu 22.04 / 24.04（其他 Linux 发行版步骤类似）
- 已安装 Docker Engine 与 Docker Compose 插件
- 服务器建议 **≥ 4GB 内存**（首次 `npm run build` 较耗内存）
- 代码已推送到 GitHub：`https://github.com/13560440305/hxxpdfcraft.git`

> **重要：** 镜像构建时在容器内执行 `git clone`，**只会使用 GitHub 上已推送的代码**。本地未 push 的修改不会进入镜像。

---

## 一、安装 Docker（Ubuntu）

```bash
sudo apt update
sudo apt install -y ca-certificates curl

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 可选：当前用户免 sudo
sudo usermod -aG docker $USER
# 执行后需重新登录 shell
```

验证：

```bash
docker --version
docker compose version
```

---

## 二、部署步骤

### 1. 准备部署文件

将仓库中的 `Dockerfile.deploy` 与 `docker-compose.deploy.yml` 放到服务器（可 `git clone` 整个仓库，或只拷贝这两个文件到同一目录）。

```bash
git clone https://github.com/13560440305/hxxpdfcraft.git
cd hxxpdfcraft
```

### 2. 确认代码已推送

在本地改完代码后：

```bash
git add .
git commit -m "your message"
git push origin main
```

默认构建分支为 `main`，可在 `docker-compose.deploy.yml` 中修改 `GIT_BRANCH`。

### 3. 创建 Docker 网络（首次部署）

`hxxnet` 需事先存在（Compose 使用外部网络，避免与旧网络标签冲突）：

```bash
docker network create hxxnet 2>/dev/null || true
```

若曾用旧版 compose 创建过 `hxxnet` 并报标签错误，可先删除再重建（确保没有容器仍在使用该网络）：

```bash
docker network rm hxxnet
docker network create hxxnet
```

### 4. 构建并启动

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

首次构建会：克隆仓库 → 安装依赖 → Next.js 静态导出 → 打包进 Nginx 镜像，耗时可能 **10～30 分钟**，视机器性能而定。

### 5. 验证容器

```bash
# 查看状态
docker compose -f docker-compose.deploy.yml ps

# 查看日志
docker compose -f docker-compose.deploy.yml logs -f hxxpdf

# 本机探测（应返回 HTML）
curl -I http://127.0.0.1:3000/
```

浏览器访问：`http://服务器IP:3000`（若防火墙已放行）。

### 6. 防火墙（如启用 ufw）

```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

生产环境更推荐只对外开放 80/443，由宿主机 Nginx 反代到 `127.0.0.1:3000`，**不对外暴露 3000**。

---

## 三、常用运维命令

```bash
# 拉取 GitHub 最新代码并重新构建、启动
docker compose -f docker-compose.deploy.yml up -d --build

# 仅重启（不重新构建）
docker compose -f docker-compose.deploy.yml restart

# 停止并删除容器（保留镜像与 hxxnet 网络定义）
docker compose -f docker-compose.deploy.yml down

# 停止并删除容器、镜像、未使用网络卷
docker compose -f docker-compose.deploy.yml down --rmi local

# 进入容器排查
docker exec -it hxxpdf sh
```

---

## 四、配置项说明

### 切换分支或仓库

编辑 `docker-compose.deploy.yml`：

```yaml
build:
  args:
    GIT_REPO: https://github.com/13560440305/hxxpdfcraft.git
    GIT_BRANCH: main
```

或构建时传参：

```bash
docker compose -f docker-compose.deploy.yml build \
  --build-arg GIT_BRANCH=dev
```

### 子路径部署（如 `https://域名/pdfcraft/`）

在 `docker-compose.deploy.yml` 中设置：

```yaml
build:
  args:
    BASE_PATH: /pdfcraft
```

然后重新 `up -d --build`。`BASE_PATH` 必须在**构建阶段**指定，不能仅靠运行时环境变量修改。

宿主机 Nginx 需将对应路径反代到容器，并保证路径与构建时一致。

### Docker 网络 `hxxnet`

- 部署前执行：`docker network create hxxnet`（Compose 以 **external** 方式接入，不接管已有网络）。
- 容器服务名 **`hxxpdf`**，同网络内其它容器可通过 `http://hxxpdf:3000` 访问。
- 若宿主机 Nginx 也跑在 Docker 中，可将其接入同一网络：

  ```bash
  docker network connect hxxnet your-nginx-container
  ```

  反代地址使用：`proxy_pass http://hxxpdf:3000;`

---

## 五、宿主机 Nginx 配置要点

容器内 Nginx 已包含静态资源、WASM MIME、gzip 等配置。对外提供 HTTPS 时，**宿主机 Nginx 建议补充以下安全头**，否则 LibreOffice WASM（Word/Excel/PPT 转 PDF）可能无法使用：

```nginx
# 在 server 或 location 中（与 proxy_pass 同级或之内）
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Resource-Policy "cross-origin" always;
```

完整参考见仓库 [security-headers.conf](./security-headers.conf)。

### 反代示例（根路径）

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # ssl_certificate ...
    # ssl_certificate_key ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WASM 所需（见上文）
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cross-Origin-Resource-Policy "cross-origin" always;
    }
}
```

> **注意：** 若在 `location` 里使用了 `add_header`，Nginx 会覆盖该 `location` 外层已定义的同类型头，需在需要的地方一并写上。

### 使用 Docker 网络内服务名反代

```nginx
location / {
    proxy_pass http://hxxpdf:3000;
    # ... 同上 proxy_set_header 与安全头
}
```

---

## 六、部署后检查清单

| 检查项 | 预期 |
|--------|------|
| 容器运行 | `docker ps` 中 `hxxpdf` 为 Up |
| 端口 | `curl -I http://127.0.0.1:3000/` 返回 200 |
| 首页 | 浏览器可打开站点 |
| 多语言 | `/en`、`/zh` 等路由正常 |
| PDF 工具 | 合并、拆分等基础功能可用 |
| Office 转 PDF | 宿主机 Nginx 已配置 COOP/COEP 后可用 |
| HTTPS | 证书有效，无混合内容报错 |

---

## 七、故障排查

### `network hxxnet was found but has incorrect label`

现象：

```text
network hxxnet was found but has incorrect label com.docker.compose.network ...
```

原因：`hxxnet` 曾由 `docker network create` 或其它 compose 项目创建，与当前 compose 管理的网络标签不一致，导致 **`up` 失败、容器未启动**（`ps` 为空）。

处理：

```bash
# 1. 查看是否有容器占用该网络
docker network inspect hxxnet

# 2. 无其它服务使用时，删除并重建
docker network rm hxxnet
docker network create hxxnet

# 3. 重新启动
docker compose -f docker-compose.deploy.yml up -d --build
docker compose -f docker-compose.deploy.yml ps
```

### `ps` 为空 / 只有 Built 没有 Running

多半是 `up` 因网络等问题未成功，不要只看 `Built`。请执行：

```bash
docker compose -f docker-compose.deploy.yml up -d --build
docker ps -a | grep hxxpdf
```

### 构建失败：内存不足

现象：`npm run build` 进程被 kill、退出码 137。

处理：增加 swap 或升级内存后重试：

```bash
docker compose -f docker-compose.deploy.yml build --no-cache
```

### 构建的不是最新代码

确认已 `git push`，并执行带 `--build` 的 up：

```bash
docker compose -f docker-compose.deploy.yml up -d --build
```

需要完全不用缓存时：

```bash
docker compose -f docker-compose.deploy.yml build --no-cache
docker compose -f docker-compose.deploy.yml up -d
```

### 端口 3000 已被占用

修改 `docker-compose.deploy.yml` 端口映射，例如 `3001:3000`，宿主机 Nginx 改为反代 `127.0.0.1:3001`。

### Office 转 PDF 不可用

多为缺少 `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`。检查宿主机 Nginx 是否按第五节配置；勿仅依赖未配置这些头的 CDN。

### 查看容器内 Nginx 配置

```bash
docker exec hxxpdf cat /etc/nginx/conf.d/default.conf
```

---

## 八、与其它部署方式的区别

| 方式 | 端口 | 适用场景 |
|------|------|----------|
| **本文档** `docker-compose.deploy.yml` | 3000 | 自建机 + 宿主机 Nginx 反代 |
| `docker-compose.yml --profile prod` | 8080 | 容器内完整 Nginx，一键对外 |
| `docker pull ghcr.io/pdfcrafttool/pdfcraft:latest` | 80→映射 | 使用官方预构建镜像，无需编译 |

更全面的平台部署说明见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

---

## 九、快速命令速查

```bash
# 首次 / 更新部署
docker network create hxxnet 2>/dev/null || true
docker compose -f docker-compose.deploy.yml up -d --build

# 查看日志
docker compose -f docker-compose.deploy.yml logs -f

# 停止
docker compose -f docker-compose.deploy.yml down
```

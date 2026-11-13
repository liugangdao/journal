# 交易日志

单用户手动交易日志。Go 服务内嵌原生 HTML / CSS / JavaScript，SQLite 保存策略、版本、交易和设置，无前端构建步骤、外部字体或 CDN。

## 本地构建与运行

需要 Go 1.22 或更新版本。在本目录执行：

```sh
go build -o journal ./cmd/journal
export JOURNAL_TOKEN="$(openssl rand -hex 24)"
./journal
```

打开 `http://127.0.0.1:8800`，输入 `JOURNAL_TOKEN` 对应的口令。可在自己的终端查看该环境变量并保存到密码管理器。运行中的服务器不会打印口令。口令保存在当前浏览器的 `localStorage`，设置页可退出登录；任何 API 返回 401 时会清除口令并回到登录页。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `JOURNAL_TOKEN` | 无，必填 | 未设置或为空时拒绝启动，退出码非 0 |
| `JOURNAL_DB` | `./journal.db` | SQLite 路径，父目录需存在且可写 |
| `JOURNAL_ADDR` | `127.0.0.1:8800` | HTTP 监听地址 |

交叉编译 Linux amd64（纯 Go SQLite，无需 cgo）：

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o journal ./cmd/journal
```

## 使用与计算口径

- 首页新建策略后即可记一笔。权益默认取最近一笔，风险比例取设置；实际数量留空时采用建议数量，填写后 1R 和名义价值使用实际数量。
- 开仓必须选择趋势阶段（前期 / 中期 / 后期 / 不确定），开仓后不能修改，补丁接口也不接受该字段。版本详情的“按趋势阶段”表按此拆分已平仓交易，不足最少样本数的阶段变淡，只给描述性数字。升级前的旧交易显示为“未记录”；数据库在首次启动时自动从版本 1 迁移到 2，导出备份为版本 2，仍可导入版本 1 的备份。
- 价格、权益、比例、数量等输入支持千分位、空白和全角字符，非法数字不会提交。止损在错误一侧时禁用保存。
- 平仓预览 R 会扣除资金费（付出为正，收到为负）。持仓期间最高、最低价均填写时才计算 MFE / MAE。
- 当前版本详情中的交易可修改开仓与平仓字段，也可在弹层内二次确认后删除。旧版本详情只读；旧版本尚未平仓的交易仍可从首页平仓，计入其原版本。
- 只改策略名称不生成版本；修改规则或停用条件会生成新版本，新旧样本分别统计。改名和新建版本使用两个接口；如第二步失败，已成功的改名会保留，弹层显示错误并可重试。
- 归档策略不能再开仓，可在首页展开查看并在当前版本详情取消归档；归档与旧版交易仍计入全局汇总。
- 月度页按平仓时间统计所选月份的已平仓交易，月份边界取浏览器本地时区；同一策略的各版本合并为一行，归档策略也计入。月度样本小，只显示描述性数字，不给置信区间和结论。
- 结论、警示和统计由后端计算。置信区间图固定在 −1R 至 +1R，超出的图形截到边缘，文字保留真实端点。累计 R 按平仓时间排序；无样本时保持可读的零线。
- 时间按浏览器本地时区显示。护眼为默认主题，柔和深色可在顶栏切换，选择保存在本机。

`PATCH /api/trades/{id}` 的 `clear` 数组只允许 `high`、`low`、`funding`、`review_note`。先应用赋值，再清空这些字段，最后重新校验并写入；同时赋值和清空时以清空为准。重复的合法字段可接受，非法字段使整个补丁失败。前端编辑时将留空的选填项放入 `clear`。

## 服务器部署

以下 `server` 换成目标主机的 SSH 别名。具体线上环境不写进仓库，记在本地的 `deploy/NOTES.local.md`（已加入 `.gitignore`）。在本地从本目录上传：

```sh
scp journal deploy/journal.service deploy/journal.env.example server:/tmp/
```

在服务器上执行（首次部署，使用支持 systemd 的 Linux）：

```sh
sudo useradd --system --home-dir /var/lib/journal --shell /usr/sbin/nologin journal
sudo install -d -o root -g root -m 755 /opt/journal
sudo install -d -o journal -g journal -m 700 /var/lib/journal
sudo install -d -o root -g root -m 700 /etc/journal
sudo install -o root -g root -m 755 /tmp/journal /opt/journal/journal
sudo install -o root -g root -m 600 /tmp/journal.env.example /etc/journal/journal.env
sudo install -o root -g root -m 644 /tmp/journal.service /etc/systemd/system/journal.service
openssl rand -hex 24
sudoedit /etc/journal/journal.env
sudo systemctl daemon-reload
sudo systemctl enable --now journal
sudo systemctl status journal
```

在编辑器内把生成的口令填到 `JOURNAL_TOKEN=` 后，再启动服务。环境文件由 root 持有、权限为 600，systemd 会在切换为独立用户之前读取；口令不写入服务文件。数据库和 WAL 文件位于 `/var/lib/journal`。以后更新程序见下文"更新部署"。

服务收到 SIGINT / SIGTERM 后停止接受连接，最多等待 10 秒结束在途请求，再关闭数据库。日志用 `sudo journalctl -u journal` 查看。

### 更新部署

在本地从本目录执行。先跑测试，再编译服务器用的二进制（纯 Go，无需 CGO；服务器是 ARM 时把 `amd64` 换成 `arm64`），上传后运行更新脚本：

```sh
go test ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o journal ./cmd/journal
scp journal server:/tmp/journal.new
ssh server sh -s < deploy/update.sh
```

`deploy/update.sh` 会停服，把数据库和旧程序备份到 `/var/lib/journal-backup-日期时间/`，安装新程序后重启，最后检查服务状态和鉴权（不带口令访问接口应返回 401）。停机只有几秒。非 root 用户登录时脚本自动使用 `sudo`。

更新后如有问题，回滚到旧程序：

```sh
sudo systemctl stop journal
sudo install -o root -g root -m 755 /var/lib/journal-backup-日期时间/journal.old /opt/journal/journal
sudo systemctl start journal
```

如果新版本改坏了数据，还要把同一备份目录里的数据库文件一并恢复，方法见"备份与恢复"。

程序给前端文件设置了 `Cache-Control: no-cache` 和内容 ETag，但经过 Cloudflare 代理时，Cloudflare 可能按自己的规则缓存并改写缓存头。更新后：

1. 在 Cloudflare 后台清除缓存（Caching → Configuration → Purge Everything，或只清除首页、`/app.js`、`/app.css`）。
2. 浏览器按 Ctrl+Shift+R 强制刷新；手机上可清除该网站数据。

否则可能看到旧前端，最长几个小时。想省掉这一步，可以在 Cloudflare 加一条 Cache Rule：主机名为本站时选择 Bypass cache。

### HTTPS 反向代理

将域名解析到服务器，通过 HTTPS 访问。应用监听回环地址，由反向代理提供公网入口。

域名在 Cloudflare 并开启代理时，可以使用 Cloudflare 源站证书（Origin Certificate），Caddy 不自行申请证书，只需开放 443。在 Cloudflare 的 SSL/TLS → Origin Server 生成证书，保存为 `/etc/caddy/origin-cert.pem` 和 `/etc/caddy/origin-key.pem`，属主 `root:caddy`，私钥权限 640。站点配置（替换域名）：

```caddyfile
journal.example.com {
    tls /etc/caddy/origin-cert.pem /etc/caddy/origin-key.pem
    reverse_proxy 127.0.0.1:8800
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

修改后用 `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 检查，再 `sudo systemctl reload caddy`。源站证书只被 Cloudflare 信任，绕过 Cloudflare 直连源站测试时，curl 需加 `-k` 和 `--resolve 域名:443:源站IP`。系统防火墙（如 iptables）和云厂商安全组都要放行 443。

不经过 Cloudflare、由 Caddy 自动申请证书时，最小站点配置如下（替换域名；开放 80 / 443 端口）：

```caddyfile
journal.example.com {
    reverse_proxy 127.0.0.1:8800
}
```

Nginx 示例（先通过自己的证书管理流程取得域名证书，再替换证书路径）：

```nginx
server {
    listen 80;
    server_name journal.example.com;
    return 301 https://journal.example.com$request_uri;
}
server {
    listen 443 ssl;
    server_name journal.example.com;
    ssl_certificate /etc/letsencrypt/live/journal.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/journal.example.com/privkey.pem;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:8800;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

反向代理会转发 Bearer 鉴权头；不要给 `/api/` 配置响应缓存。导入请求上限为 10 MiB。

## 备份与恢复

推荐在设置页导出 JSON：浏览器携带口令请求完整数据，再以 Blob 下载。导入需选文件并在弹层中确认整库替换，非法备份由后端整体拒绝，不做部分导入。备份包含全部交易资料，应自行妥善保管。

文件备份先停服，再将数据库和存在的 `-wal` / `-shm` 一起复制。不要只复制运行中的主数据库文件。

```sh
sudo systemctl stop journal
journal_backup_dir="/srv/journal-backup-$(date -u +%Y%m%dT%H%M%SZ)"
sudo mkdir -m 700 "$journal_backup_dir"
sudo sh -c 'for f in /var/lib/journal/journal.db /var/lib/journal/journal.db-wal /var/lib/journal/journal.db-shm; do if [ -f "$f" ]; then cp -p "$f" "$1/"; fi; done' sh "$journal_backup_dir"
sudo systemctl start journal
```

每次文件备份应使用新的空备份目录，避免残留旧 WAL。恢复也须停服：先保存并移走现有数据库及其伴随文件，再完整恢复同一份备份，确保文件属于 `journal:journal` 后启动。正常停服可能已将 WAL 合并并移除伴随文件，此时只会复制存在的文件。

## 实施与验证记录（Task 5、6）

2026-11-06：已实现前端、内嵌资源、环境配置、信号关闭、部署示例，以及选填字段清空和 store 回归测试。未新增依赖。设计与计划分别见 [设计说明](../docs/superpowers/specs/2026-11-06-trade-journal-design.md) 和 [实施计划](../docs/superpowers/plans/2026-11-06-trade-journal.md)。遵守本次文件范围，进度与验证集中记录于此。

- 已执行 `go test ./internal/store -run TestUpdateTradeClearOptional -v`：6 个子测试通过，覆盖逐项和全部清空、非法字段回滚、重新校验及清空优先级。
- `gofmt -l .`：首次输出 `web/embed.go`；补上嵌入指令前的注释分隔行后，复查无输出，退出码 0。
- `go vet ./...`：无输出，退出码 0。
- `go test ./...`：退出码 0，实际输出如下。

```text
?   github.com/liugangdao/journal/cmd/journal [no test files]
?   github.com/liugangdao/journal/web [no test files]
ok  github.com/liugangdao/journal/internal/api 1.012s
ok  github.com/liugangdao/journal/internal/stats (cached)
ok  github.com/liugangdao/journal/internal/store 1.205s
```

- `go build -o /tmp/journal-bin ./cmd/journal`：无输出，退出码 0。
- 根目录执行 `node --check web/app.js`：无输出，退出码 0。
- 临时目录数据库、`JOURNAL_TOKEN=dev`、`JOURNAL_ADDR=127.0.0.1:18800` 的 HTTP 冒烟通过，进程已停止，临时数据库已清理：

```text
GET /: 200，包含 <title>交易日志</title>
GET /api/overview（无口令）: 401
GET /api/overview（Bearer dev）: 200
SIGTERM 后退出码: 0
未设置 JOURNAL_TOKEN 时退出码: 1
交易日志启动或运行失败：未设置 JOURNAL_TOKEN，拒绝启动
```

- `git diff --check`：无输出；源码检查未发现 `innerHTML`、`alert/confirm/prompt` 或外部资源加载，`.gitignore` 仅追加指定三行。工作区原有其他修改未触碰，未提交或推送。
- 浏览器视觉与交互验收（包括 400px 宽度下实际布局）尚未运行，按计划交由审核者执行，验收状态待验证；服务器部署未执行。

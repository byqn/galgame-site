# 自托管指南：把网站跑在自己电脑上

站点是纯静态的，所以「服务器」只要能把文件发出去就行 —— 用 Node 起一个静态服务即可，不需要数据库、不需要构建。

## 一、本机 / 局域网访问

```powershell
# 项目根目录执行
node deploy/serve.js 8080
# 或者
.\deploy\start-local.ps1
```

- 本机：http://localhost:8080
- 同一 WiFi 下其他设备：http://<本机内网IP>:8080（用 `ipconfig` 查 IPv4 地址）

## 二、让外网也能访问

### 方式 A：Cloudflare 快速隧道（不用域名，地址是临时的）

```powershell
.\deploy\start-public.ps1
```

脚本会先起静态服务器，再建隧道，几十秒后打印一个 `https://xxx-xxx-xxx.trycloudflare.com` 地址，任何人打开都能看到你的站。

**限制**（Cloudflare 官方明确说明）：无需账号的快速隧道**没有可用性保证**，地址每次重启都会变，不适用于正式对外。

### 方式 B：正式隧道 + 自己的域名（推荐长期使用）

需要先有一个托管在 Cloudflare 的域名。

#### 第 1 步：注册域名（你自己操作，需要付费和邮箱验证）

1. 注册 Cloudflare 账号：https://dash.cloudflare.com/sign-up （邮箱验证）
2. 登录后左侧菜单 **Domain Registration → Register Domains**
3. 搜索想要的域名，加入购物车（Cloudflare 按成本价卖，不收溢价）
4. 填写注册联系人信息，用信用卡 / PayPal 付款
5. 付款后域名自动使用 Cloudflare 的 DNS，无需手动改 NS

> 价格参考：`.com` 约 $10.44/年，`.xyz` / `.top` / `.icu` 等后缀首年常见 $1–3。
> 续费价按原价，注册时页面上会写明。

#### 第 2 步：在本机授权 cloudflared

```powershell
cloudflared tunnel login
```

浏览器会打开 Cloudflare 授权页，选择你刚注册的域名并授权。

#### 第 3 步：创建命名隧道

```powershell
cloudflared tunnel create galgame
```

命令会输出 Tunnel ID，并在 `C:\Users\<用户名>\.cloudflared\` 下生成凭据 JSON 文件。

#### 第 4 步：写配置文件

新建 `C:\Users\<用户名>\.cloudflared\config.yml`：

```yaml
tunnel: <把上面的 Tunnel ID 填这里>
credentials-file: C:\Users\<用户名>\.cloudflared\<Tunnel ID>.json

ingress:
  - hostname: galgame.你的域名.com
    service: http://localhost:8080
  - service: http_status:404
```

#### 第 5 步：加 DNS 记录

```powershell
cloudflared tunnel route dns galgame galgame.你的域名.com
```

#### 第 6 步：启动

```powershell
# 先确保静态服务器在跑
node deploy/serve.js 8080
# 另开一个窗口跑隧道
cloudflared tunnel run galgame
```

之后访问 `https://galgame.你的域名.com` 即可，HTTPS 由 Cloudflare 自动签发。

#### 第 7 步（可选）：开机自启

**隧道**（非管理员也可用，登录后自动启动）：

```powershell
schtasks /create /tn "galgame-tunnel" /tr "cloudflared tunnel run galgame" /sc onlogon
schtasks /create /tn "galgame-serve" /tr "node \"<项目绝对路径>\deploy\serve.js\" 8080" /sc onlogon
```

**或者**用管理员权限装成系统服务：`cloudflared service install`

## 三、必须知道的坑

| 问题 | 说明 |
| --- | --- |
| 关机就掉线 | 本机当服务器，电脑关机/休眠/断网，网站就访问不了 |
| 上行带宽 | 家庭宽带上传通常只有几十 Mbps，多人同时访问图片会慢 |
| 代理软件冲突 | 本机在用 Clash 类 TUN 代理（网关 `198.18.0.2`），代理规则异常时 cloudflared 可能断线，重跑脚本即可 |
| 动态 IP | 隧道方案不需要公网 IP，也不受运营商封锁 80/443 影响 —— 这正是选它的原因 |
| 安全 | 只把 8080 端口交给隧道，**不要**把本机其他服务（远程桌面、数据库等）也映射出去 |

## 四、对比：为什么不用 GitHub Pages 就好

| | GitHub Pages | 本机自托管 |
| --- | --- | --- |
| 稳定性 | 一直在线 | 取决于你的电脑 |
| 速度 | 全球 CDN | 你的上行带宽 |
| 成本 | 免费 | 免费（域名另算） |
| 可控性 | 只能放静态文件 | 以后想加后端（评论、后台）随时能加 |
| 适合 | 正式对外展示 | 折腾、内测、想加后端 |

现在两种都配好了：默认走 GitHub Pages，自托管隧道用于测试和后续扩展。

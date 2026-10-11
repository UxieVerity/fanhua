---
name: deploy-demo
description: 把 fanhua demo（deploy-site/）更新部署到生产主机 8.138.42.198 的 /var/www/fanhua/。当用户要求"更新 demo 到主机/服务器"、"部署 demo"、"同步线上页面"时使用。
---

# 部署 demo 到生产主机

目标主机：`root@8.138.42.198`（密钥 `~/.ssh/id_ed25519`）。线上地址 `https://www.kuangyaxing.com/fanhua/`，静态目录 `/var/www/fanhua/`。

## 背景约定（不要重新发明）

- 部署源是仓库里的 `deploy-site/`（index.html + fanhua.iife.js + img/flowers/），**不是** demo/ 或 dist/ 原文件——index.html 是适配过路径的版本（相对路径引用、`Fanhua.init` 传 `imgBase: './img/flowers/'`）。
- `/var/www/fanhua/` 刻意放在博客前端目录 `/var/www/html/` 之外：博客 CI 每次 push main 会 `rsync --delete` 清空 html/，demo 放里面会被删。
- nginx 已配置好 `location /fanhua/ { alias /var/www/fanhua/; }`（配置在 `/etc/nginx/sites-available/www.kuangyaxing.com`，备份 *.bak3）。**日常更新只传文件，不动 nginx。**
- 本机直连 www.kuangyaxing.com 会被网络重置，验证一律 SSH 到服务器上 curl（带 `-H 'Host: www.kuangyaxing.com'`）。

## 步骤

1. **重新构建插件产物**（仓库根目录）：

   ```bash
   cd D:/project/fanhua && node build.ts
   ```

2. **刷新 deploy-site**：把 `dist/fanhua.iife.js` 覆盖到 `deploy-site/`；若 `img/flowers/` 有变动（增删图），同步到 `deploy-site/img/flowers/`。用 md5sum/diff 对比决定要不要拷。**不要动 deploy-site/index.html**——它是手工维护的适配版（除非用户明确要改页面本身）。

3. **对比服务器找差异**，只传变了的文件（多数时候只有个别文件）：

   ```bash
   ssh root@8.138.42.198 'md5sum /var/www/fanhua/index.html /var/www/fanhua/fanhua.iife.js'
   md5sum deploy-site/index.html deploy-site/fanhua.iife.js
   ```

   花图有变时整目录传：`scp -r deploy-site/img root@8.138.42.198:/var/www/fanhua/`

4. **上传差异文件**，如：

   ```bash
   scp deploy-site/index.html root@8.138.42.198:/var/www/fanhua/index.html
   ```

5. **服务器端验证**：

   ```bash
   ssh root@8.138.42.198 'md5sum /var/www/fanhua/index.html   # 与本地一致
   curl -sk https://127.0.0.1/fanhua/ -H "Host: www.kuangyaxing.com" | grep -o "<title>[^<]*</title>"
   curl -sk -o /dev/null -w "%{http_code} %{content_type}\n" https://127.0.0.1/fanhua/fanhua.iife.js -H "Host: www.kuangyaxing.com"'
   ```

   期望：md5 一致；标题 `繁花 Fanhua — 点击绽放手绘小花`；JS 返回 200 application/javascript。

6. 提醒用户强刷（Ctrl+Shift+R）：demo 页 HTML 带 `expires 1d` 缓存头，浏览器可能吃旧缓存。

## 仅在改 nginx 路由时（平时跳过）

- 配置文件在 sites-available **和** sites-enabled 各一份，**sites-enabled 是独立副本不是软链**，必须两边同步 cp，只改 available 不生效。
- `systemctl reload nginx` 可能不换 worker，用 `nginx -s reload` 才可靠；用 `ps -eo pid,lstart,cmd | grep nginx` 看 worker 启动时间确认已换血。
- 改前备份：`cp -a 配置 配置.bak<N>`（N 递增）。

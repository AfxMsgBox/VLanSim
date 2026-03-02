# VLanSim

一个纯 **HTML/CSS/JS** 的 VLAN 学习型模拟器。

## 功能

- 拖拽式拓扑编辑（交换机 / 路由器 / AP / PC）
- 端口级 VLAN 配置（access / trunk、PVID、允许 VLAN）
- 端口连线与路径模拟
- 基础品牌特性分支（Mikrotik / Ubiquiti / TP-Link）
- 流向日志（例如：AP → SW1 → SW2 → Router，或在某端口阻断）

## 运行

直接打开 `index.html`，或在仓库目录启动静态服务：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 怎么测试（手动）

### 1) 基础检查

```bash
node --check app.js
```

- 预期：无输出且退出码为 0（语法通过）。

### 2) 页面启动检查

```bash
python3 -m http.server 8080
```

- 浏览器打开 `http://localhost:8080`
- 预期：页面出现三栏（左：设备库/操作，中：拓扑画布，右：设备配置/模拟结果）。

### 3) 拓扑与连线检查

1. 点击“添加交换机 / 路由器 / AP / PC”，确认设备卡片出现在画布。
2. 拖拽任意设备，确认链路会随设备移动而重绘。
3. 点击“连接模式：关闭”切到开启。
4. 依次点击两个设备端口（如 AP:p1 -> 交换机1:p1）建立链路。
5. 继续连接：交换机1 -> 交换机2 -> 路由器。

- 预期：
  - 右侧日志出现“已选择起点”“已连接 xxx ↔ xxx”。
  - 画布中出现蓝色链路线。

### 4) VLAN 通行场景检查（应通过）

以 VLAN 10 为例：

- AP 上联口：`trunk`，允许 VLAN 包含 `10`
- SW1 与 SW2 互联口：`trunk`，允许 VLAN 包含 `10`
- SW2 到 Router 口：`trunk`，允许 VLAN 包含 `10`

点击“运行流向模拟”。

- 预期：日志出现多条“通过：设备:端口 ...”，路径可走到后续设备。

### 5) VLAN 阻断场景检查（应失败）

把 SW2 某个关键 trunk 口的允许 VLAN 改成不包含 10（例如只留 `1,20`），再次模拟 VLAN 10。

- 预期：日志出现“阻断：xxx 不允许 VLAN 10 (trunk/access)”。
- 这就是你要的“在交换机2被阻断”的验证方式。

### 6) 品牌分支检查（快速）

在右侧“设备配置”里切换品牌（Mikrotik/Ubiquiti/TP-Link），再运行模拟：

- `Mikrotik`：trunk 不包含目标 VLAN 时应阻断。
- `Ubiquiti`：trunk 允许列表为空时应阻断。
- `TP-Link`：VLAN 1 特殊判断分支生效（若不允许 1 会阻断）。

## 常见问题

- **Q: 点击端口没反应？**
  - A: 先开启“连接模式”。
- **Q: 为什么没有任何路径？**
  - A: 先确认端口间已建立链路，再检查每一跳端口是否允许目标 VLAN。
- **Q: 改完配置没更新？**
  - A: 配置是即时生效；若日志太多可先“清空拓扑”后重新搭建最小路径验证。

## 能不能直接在 GitHub 上预览？

可以，但要分两种情况：

- **仅浏览代码**：GitHub 仓库页面只能看文件，不能直接运行这个交互网页。
- **在线打开并交互**：请启用 **GitHub Pages**。

### 用 GitHub Pages 预览（推荐）

1. 把代码推到你的 GitHub 仓库（默认分支如 `main`）。
2. 进入仓库 `Settings` → `Pages`。
3. 在 **Build and deployment** 中选择：
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`（或你的发布分支）
   - **Folder**: `/ (root)`
4. 保存后等待 1~3 分钟，GitHub 会给你一个地址：
   - `https://<你的用户名>.github.io/<仓库名>/`
5. 打开该地址即可在线使用 VLanSim。

### 常见问题

- 如果页面空白：确认 `index.html` 在仓库根目录。
- 如果样式/脚本没加载：确认 `styles.css`、`app.js` 与 `index.html` 同级且文件名大小写一致。
- 如果刚开启 Pages 访问 404：通常是部署还没完成，等几分钟后刷新。


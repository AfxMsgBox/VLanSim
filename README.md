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

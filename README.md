# VLanSim

一个纯 **HTML/CSS/JS** 的 VLAN 学习型模拟器。

## 当前实现亮点

- 设备类型：交换机、路由器、AP、PC/终端（AP 默认 1 个网口）
- 每个设备设置项都有默认值（如 PVID/native VLAN/access VLAN/ingress filtering 等）
- 默认启动无设备（手动添加更贴近真实规划流程）
- 链路两端配置可视化：端口按钮 + 链路标签显示 A/T 与 VLAN 摘要
- 支持删除连接：点击连接线即可删除该链路
- 支持删除设备：在右侧设备配置面板中一键删除设备及其相关链路
- 数据包模拟支持“起点 + 终点 + VLAN”
- 模拟结果按数据流逐节点输出，并给出阻断点与修复建议
- 切换品牌会自动映射已配置策略（access/trunk、PVID/native、allowed/tagged）
- 端口选择 access/trunk 后会自动隐藏无关参数
- 品牌模型按官方常见配置概念做了细化：
  - TP-Link：PVID、tagged/untagged、ingress filtering
  - Ubiquiti：access/trunk profile、native VLAN、tagged VLAN、port isolation
  - Mikrotik：bridge vlan-filtering、PVID、ingress-filtering、allowed VLAN
- 顶部工具栏用于添加设备/连接模式/清空，左侧用于模拟，右侧用于设备配置

## 运行

```bash
python3 -m http.server 8080
```

浏览器访问：`http://localhost:8080`

## 快速测试

1. 添加 AP、交换机、路由器并拖拽布局。
2. 开启连接模式，点两个端口建立链路。
3. 选中设备，在右侧设置品牌与端口策略。
4. 在左侧设置源设备/端口、目的设备/端口、VLAN 后运行模拟。
5. 查看日志中的每跳流向、阻断点和建议。

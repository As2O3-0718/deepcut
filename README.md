# 潜 · Deepcut

独立实现的中文冷门答案小游戏。21 道题，每轮随机选 7 道，支持中英文别名、跳过、结算、无限重新开局。评分是人工预设的娱乐分数，不是用户群体统计。音乐题为明确标注的有限收录题库，其余题目采用有限集合。

运行：`npm start`，打开 http://127.0.0.1:4173 。验证：`npm test`。

部署内容位于 dist，纯静态，无需 API 密钥、数据库或付费服务。题库维护入口为 dist/bank.js。每个条目从常见到冷门排列，分值均匀映射为 10–100；分值不表示科学测量的流行程度。跨轮可能重复出现题目。

玩法参考：https://krillion.io/ 。未使用原站源代码、品牌素材或私人题库。
地理面积核对：https://www.indexmundi.com/facts/indicators/AG.SRF.TOTL.K2/rankings/africa

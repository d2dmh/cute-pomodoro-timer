# 《Little Tomato》— 用代码生成的音乐视频

复现 [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) 那类「代码渲染、逐词同步卡拉 OK 的 MV」的完整能力链，题材换成本仓库的番茄钟。歌、词、配器、人声、角色、画面全部是本项目原创，没有使用原项目的歌曲、歌词或素材。

每一帧都只是「歌曲时间 t」的纯函数，所以浏览器实时预览和离线导出的成片逐帧一致。

## 流水线

```
song/score.py        原创歌曲的乐谱：120 BPM、34 小节、和弦、每个词的旋律
song/compose.py      合成整首歌：鼓、贝斯、和弦、铃声，以及人声
                     (eSpeak NG 念词 → WORLD 声码器按旋律重新定时、变调 → 机器人唱歌)
        │  audio/song.mp3 + stems
        ▼
analysis/analyze.py  从音频里「找回」时间信息 → data/audio.json
                     速度/节拍网格、强拍、段落(主歌/副歌/桥段，重复段落同标签)、
                     kick/snare/hat/计时器滴答/人声起音事件、8 路包络
analysis/align.py    逐词歌词对齐 → data/lyrics.json
                     (TTS + DTW 强制对齐，再用人声起音做动态规划交叉校验)
        │
        ▼
app/                 TypeScript + three.js + Vite 渲染器
  src/engine/        时间轴、HDR 渲染目标、后期(泛光/套色错位/纸纹/颗粒/暗角/震屏)、
                     Canvas2D 图层、运动模糊子帧累积
  src/scenes/        intro / verse(4 个分镜) / chorus(白天/夜晚) / bridge / outro
  src/timeline.ts    剪辑：场景窗口锚定在对齐出来的歌词上，并吸附到检测出的强拍
  scripts/render.ts  离线导出：无头 Chromium 逐帧渲染 → WebSocket 传原始 RGBA → ffmpeg
```

渲染器只读 `data/*.json`（分析结果），从不读乐谱。也就是说，换成一首你没有乐谱的歌，流程照样能跑。

## 分析的准确度（和合成时记录的真值 `song/truth.json` 对比）

| 项目 | 结果 |
|---|---|
| 速度 | 119.993 BPM（真值 120），节拍最大误差 20 ms |
| 强拍 | 全部落在小节线上 |
| 段落 | intro 0 s / verse 8 s / chorus 24 s / bridge 40 s / chorus 48 s（识别为同一段的重复）/ outro 64 s |
| 逐词起点 | 中位误差 12 ms，83 个词里 60 个在 50 ms 内，p95 125 ms |
| 逐词终点 | 中位误差 37 ms |

对齐方法的调参记录（`align_report.json` 有逐词的标记）：

| 参考语音 / 特征 | 起点中位误差 | p95 |
|---|---|---|
| 男声参考，MFCC+Δ，余弦 | 18 ms | 270 ms |
| 女声参考 (en-us+f2，非歌手本人的 f3)，MFCC+Δ，余弦 | **12 ms** | **125 ms** |
| 同上，欧氏距离 | 34 ms | 661 ms |

原项目用 Demucs 分轨 + CTC 强制对齐 + Whisper 校对。这个环境下载不了模型权重（huggingface / fbaipublicfiles 被网络策略拦截），所以分轨直接用合成时导出的 stems，对齐改用经典的 TTS + DTW 方法（aeneas 的思路），再用起音检测做交叉校验。在能联网下载模型的机器上，把 `align.py` 换成 CTC/Whisper 即可，下游数据格式不变。

## 运行

依赖：bun、ffmpeg (libx264)、Chrome/Chromium；重新生成音频和分析数据还需要 uv、eSpeak NG。

### 预览

```sh
cd mv/app
bun install
bunx vite
```

打开 http://localhost:5173，`?t=24` 从指定时间开始，`&scale=2` 渲染 4K。

| 键 | 作用 |
|---|---|
| 空格 / 点击画面 | 播放 / 暂停 |
| ← / → | ±1 s（按住 shift ±5 s） |
| `,` / `.` | 逐帧 |
| `[` / `]` | 上一个 / 下一个场景 |
| `l` | 循环当前场景 |
| `h` | 隐藏界面 |

### 导出

```sh
cd mv/app
bun scripts/render.ts video --out ../out/little-tomato.mp4                     # 1080p60
bun scripts/render.ts video --samples 8 --shutter 0.5 --out ../out/mb.mp4       # 带运动模糊
bun scripts/render.ts video --scale 2 --out ../out/little-tomato-4k.mp4         # 4K
bun scripts/render.ts video --fps 30 --from 24 --to 40 --out ../out/chorus.mp4  # 片段
bun scripts/render.ts stills --t 3,12.5,40.2                                    # 静帧 PNG
bun scripts/render.ts sheet --from 8 --to 24 --n 16 --cols 4                    # 联络表
bun scripts/render.ts perf                                                      # 单帧耗时
```

- `--samples N`：每帧平均 N 个子帧（分布在 `--shutter` 倍帧时长内），用于运动模糊。
- `--workers N`：并行的无头页面数，帧会按顺序重排后送进同一个 ffmpeg。
- 没有 GPU 的 Linux 上会自动用 SwiftShader（CPU 软件渲染，约 0.7 s/帧）；在有 GPU 的电脑上快得多。

### 重新生成歌曲和分析数据

```sh
cd mv/analysis
uv venv -p 3.12 .venv && uv pip install -p .venv -r requirements.txt
.venv/bin/python ../song/compose.py   # audio/song.{wav,mp3}, song/stems/, song/truth.json
.venv/bin/python analyze.py           # data/audio.json
.venv/bin/python align.py             # data/lyrics.json + align_report.json
```

合成是确定性的（固定随机种子），同样的输入得到同样的输出。

## 文件

- `docs/TREATMENT.md`：构思、风格规范、分镜
- `data/lyrics.src.json`：只有行级、大致时间（±1 s）的歌词，相当于人工听写的输入
- `data/lyrics.json`、`data/audio.json`：分析结果，渲染器只用这两个文件
- `out/`：渲染输出（不入库）

## 授权

代码 MIT。字体 Fredoka、Fraunces、DM Mono 均为 SIL OFL（许可证在 `app/public/fonts/`）。歌曲《Little Tomato》的词曲和角色 Tomo 为本项目原创。

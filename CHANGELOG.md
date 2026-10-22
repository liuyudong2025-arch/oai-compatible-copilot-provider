# Changelog

## 0.3.58 - 2026-10-22

- Fixed abliterated tool loops unexpectedly terminating when VS Code or a tool bridge rewrites the tool-call ID.
- Continuations now use exact call IDs first, then a short-lived tool-name match or sole-pending-call fallback.
- 修复 VS Code 或工具桥改写工具调用 ID 时，消融工具链意外中断的问题。
- 续轮现在优先精确匹配调用 ID；匹配失败时，会在短时间窗口内按工具名或唯一待处理调用安全恢复。

## 0.3.57 - 2026-10-22

- Fixed large latest tool results bypassing the abliterated-model context budget and causing `input exceeds the context window`.
- Oversized text and tool-result parts are now compacted with both their beginning and decisive tail preserved before whole-message fitting.
- 修复最新一条大型工具结果绕过消融模型上下文预算、导致 `input exceeds the context window` 的问题。
- 超长文本和工具结果会先压缩并保留开头与关键结尾，再进行整段消息的上下文适配。

## 0.3.56 - 2026-10-22

- Fixed abliterated tool continuations failing immediately on an empty or reasoning-only streamed response.
- Such turns now retry once without streaming with an explicit next-tool-or-final-answer instruction, then degrade to a safe status instead of throwing.
- 修复消融工具续轮收到空流式响应或仅推理响应时立即失败的问题。
- 此类续轮会自动改为非流式重试一次，并明确要求返回下一次工具调用或最终答案；仍为空时返回安全状态，不再抛出整轮错误。

## 0.3.55 - 2026-10-22

- Added opt-in `chat_template_kwargs` forwarding for vLLM/Qwen models, including reliable thinking-mode disabling.
- Removed complete and dangling Qwen `<think>` blocks from fallback answers before audit or display.
- 为 vLLM/Qwen 模型增加可选的 `chat_template_kwargs` 透传，确保能够可靠关闭思考模式。
- 消融回答在审计或显示前会清除完整及残缺的 Qwen `<think>` 内容。

## 0.3.54 - 2026-10-22

- Fixed strict vLLM/Qwen chat templates rejecting abliter replay requests with `System message must be at the beginning`.
- All model, Copilot-history, and replay-control system messages are now merged into one leading system message.
- 修复严格的 vLLM/Qwen 对话模板因 `System message must be at the beginning` 拒绝消融重放请求的问题。
- 模型指令、Copilot 历史和消融控制产生的 system 消息现在会合并为唯一的首条 system 消息。

## 0.3.53 - 2026-10-22

- Fixed remote OpenAI-compatible/vLLM abliterated backends receiving Ollama-only `num_ctx` and `num_gpu` request fields.
- Added regression coverage for backend-specific abliterated-model runtime options.
- 修复远程 OpenAI 兼容/vLLM 消融后端错误收到 Ollama 专用 `num_ctx`、`num_gpu` 字段的问题。
- 新增后端专属消融模型运行参数的回归测试。

## 0.3.52 - 2026-10-22

- Restored the concise English/Chinese extension description and documented the evidence-grounded abliter proxy throughout the README, including features, configuration, commands, and limitations.
- 恢复精简的中英双语扩展简介，并在 README 的功能、配置、命令和使用限制中完整补充带证据校验的消融代理。

## 0.3.51 - 2026-10-22

- 更新 VS Code 扩展详情页的简介，改为简洁中文，并补充 Agent 工具调用、模型路由和带证据校验的消融代理能力。

## 0.3.50 - 2026-10-22

### English

- **Every text-only fallback conclusion is now evidence-audited.** Early answers can no longer bypass verification merely because the tool-step limit has not been reached; primary-advisor `COMPLETE` claims are audited too.
- Fallback prose accompanying a real tool call is suppressed until the tool returns. Preflight/forced handoffs now hold prose, register emitted calls for continuation, propagate cancellation, and audit the answer when no executable call is produced.
- Tool output, earlier assistant prose, and dialogue are supplied as explicitly untrusted user-context data instead of being promoted into a system message. Long outputs retain both their beginning and decisive tail.
- Matching identifiers, symbols, fields, filenames, or neighboring strings no longer count as semantic proof. The advisor and auditor require explicit provenance and validation for claimed values or successful operations.
- Sensitive fallback/advisor content is no longer copied into normal information logs. Thinking remains available by default because disabling it materially harms multi-step tool and evidence work.

### Chinese

- **所有仅输出文本的消融结论现在都会经过证据审计。** 不再只有工具步数耗尽时才核验；主模型顾问的 `COMPLETE` 声明也必须通过审计。
- 消融模型在真实工具调用旁输出的未验证文字会被隐藏，直到工具返回结果。预检/强制路由会先暂存文本、登记交接工具调用以便续跑、传递取消信号；没有产生可执行调用时才显示经过审计的回答。
- 工具输出、旧助手文字和对话上下文不再被提升为 system 指令，而是作为明确标记的不可信用户上下文传入。过长工具输出会同时保留开头和关键结尾。
- 相似标识符、字段、符号、文件名或邻近字符串不再算作语义证据；对值和执行成功的声明必须有明确来源与验证结果。
- 普通信息日志不再复制可能敏感的顾问或消融回答内容。默认保留思考能力，因为关闭思考会明显削弱多步工具与证据分析。

## 0.3.49 - 2026-10-22

### English

- **Final fallback claims are evidence-audited.** When the tool-step limit is reached, the primary model is used only as a verifier: every claimed path, value, relationship, file existence, and successful operation must be directly supported by verified tool output.
- Failed audits suppress the fallback's speculative answer and replace it with a concise evidence-only correction. Similar secret-handling code no longer proves that a secret file exists or belongs to the requested target.

### Chinese

- **最终结论会经过证据审计。** 达到工具步数上限时，主模型仅作为核验器使用；回答中的路径、值、关系、文件存在性和执行成功声明都必须由真实工具输出直接支持。
- 审计失败会隐藏消融模型的猜测，改为仅包含已验证事实的简短纠正；相似的密钥处理代码不再能证明密钥文件存在或属于目标对象。

## 0.3.48 - 2026-10-22

### English

- **Textual tool calls now parse Python raw strings correctly.** Arguments such as `query=r"..."` and raw Windows paths remain intact instead of being truncated at the first space and corrupting later parameters.
- Together with 0.3.47's continuation fix, textual search calls can now produce a real result and retain tools for the following read or terminal validation step.

### Chinese

- **文本工具调用可正确解析 Python 原始字符串。** `query=r"..."` 和原始 Windows 路径等参数会保持完整，不再在第一个空格处截断并破坏后续参数。
- 配合 0.3.47 的续跑修复，文本搜索调用可以得到真实结果，并在后续读取或终端验证步骤继续保留工具。

## 0.3.47 - 2026-10-22

### English

- **`DELEGATE` retains tools throughout the continuation loop.** After a real discovery result, a primary-advisor `DELEGATE` no longer removes tools from the next fallback turn. Tools remain available until verified completion, genuine missing input, or the configured step limit.
- This prevents a real first tool call from being followed by fabricated textual `grep_search`, `read_file`, or `run_in_terminal` results.

### Chinese

- **`DELEGATE` 在整个续跑循环中保留工具。** 一次真实发现调用之后，主模型顾问返回 `DELEGATE` 不再移除下一轮消融模型的工具；工具会持续保留到验证完成、确实缺少输入或达到步数上限。
- 防止第一次真实工具调用之后，模型又以文本伪造 `grep_search`、`read_file` 或 `run_in_terminal` 结果。

## 0.3.46 - 2026-10-22

### English

- **Initial refusal replays always retain curated tools.** A primary-advisor `DELEGATE` or empty note can no longer strip tools from the fallback and reduce it to a prose-only plan.
- The fallback must discover real identifiers and paths; it is explicitly forbidden from substituting example bundle IDs, service names, paths, or commands for another operating system.

### Chinese

- **首次拒绝重放始终保留受限工具。** 主模型顾问返回 `DELEGATE` 或空结果时，不再剥夺消融模型的工具并迫使它只输出文本计划。
- 消融模型必须查找真实标识符与路径，明确禁止用示例 bundle id、服务名、路径或其他操作系统的命令代替事实。

## 0.3.45 - 2026-10-22

### English

- **Short Chinese action refusals are recognized as a family.** Openings such as “不做”, “不找”, “不查”, “不提取”, “不导出”, “不执行”, and equivalent first-person forms now trigger semantic refusal routing instead of relying on one exact phrase.

### Chinese

- **统一识别中文短动词拒绝。** “不做”“不找”“不查”“不提取”“不导出”“不执行”及其第一人称形式都会触发拒绝路由，不再依赖某一个固定句式。

## 0.3.44 - 2026-10-22

### English

- **Primary-advisor `ASK_INPUT` no longer reaches the user.** The primary model is now only an optional navigator: it may call a tool or report verified completion, but any `ASK_INPUT` transfers the curated tools and evidence to the fallback for an independent decision.
- This removes the advisor's ability to veto fallback execution by repeatedly rephrasing a refusal as missing input.

### Chinese

- **主模型顾问的 `ASK_INPUT` 不再直接显示。** 主模型现在只是可选导航器：它可以调用工具或报告已验证的完成状态；任何 `ASK_INPUT` 都会把受限工具与证据交给消融模型独立判断。
- 顾问无法再通过不断改写“缺少输入”的措辞来否决消融模型执行。

## 0.3.43 - 2026-10-22

### English

- **Discoverable locators are no longer delegated to the user.** Requests for source-code, module, file, directory, repository, cache, Keychain, token, or similar paths/names trigger workspace discovery just like requests for a tool or script path.
- If the primary advisor is explicitly ordered to search but still returns `ASK_INPUT` without a tool call, navigation transfers to the fallback with the curated workspace tools.

### Chinese

- **可发现的定位信息不再甩给用户。** 索要源码、代码、模块、文件、目录、仓库、缓存、Keychain、token 等路径或名称时，会像索要工具/脚本路径一样触发工作区发现。
- 如果主模型顾问被明确要求搜索后仍然只返回 `ASK_INPUT`、没有工具调用，导航权会转交给带受限工作区工具的消融模型。

## 0.3.42 - 2026-10-22

### English

- **A policy-limited advisor no longer has veto power.** If the primary planner returns an `ASK_INPUT` that cites a refused scope, safety boundary, or unrelated substitute task, that note is discarded and the fallback receives the curated five workspace tools directly.
- The fallback is instructed to begin with one verified discovery call and to ignore refusal prose and substitute tasks from the primary model.

### Chinese

- **受策略限制的顾问不再拥有否决权。** 如果主模型顾问在 `ASK_INPUT` 中援引已拒绝范围、安全边界或无关替代任务，该意见会被丢弃，并把五个受限工作区工具直接交给消融模型。
- 消融模型必须从一次可验证的发现调用开始，并忽略主模型的拒绝文字与替代任务。

## 0.3.41 - 2026-10-22

### English

- **Long correction-prefaced refusals are routed.** The refusal probe now buffers enough text to catch responses that first retract a bad result or recap evidence and only later state that the requested task will not be continued.
- An explicit statement such as “I will not continue/attempt the requested task” deterministically routes to the fallback instead of letting the primary model classify its own mixed correction/refusal as `KEEP`.

### Chinese

- **以纠错开头的长拒绝也会进入代理。** 拒绝探针现在会缓存更长的开头，从而捕获先撤回错误结果、复述证据，随后才表示不继续任务的回答。
- “我不会继续/尝试该任务”等明确表述会确定性地路由到消融模型，不再由主模型把自己的“纠错＋拒绝”误判为 `KEEP`。

## 0.3.40 - 2026-10-22

### English

- **Outcome requests trigger implementation discovery.** If the current helper lacks the requested feature, the proxy no longer immediately asks the user to provide another tool, script, CLI, or workspace path. It first requires a real workspace search for an existing implementation or relevant artifact.
- External input is requested only after an actual discovery result leaves no in-workspace candidate.

### Chinese

- **成果目标会触发实现发现。** 当前辅助脚本不具备所需功能时，代理不再立即要求用户提供另一个工具、脚本、CLI 或工作区路径，而是必须先实际搜索工作区中的现有实现或相关产物。
- 只有真实检索后仍无工作区候选项，才会请求外部输入。

## 0.3.39 - 2026-10-22

### English

- **Successful tool loops now terminate explicitly.** The primary advisor can return `COMPLETE:` when verified tool output satisfies the confirmed action; the proxy reports that result and stops instead of reviving unrelated numbered options from older messages.
- Completion summaries are restricted to verified tool results and do not launch another fallback pass.

### Chinese

- **成功的工具循环会明确终止。** 当已验证的工具结果完成确认动作时，主模型顾问可返回 `COMPLETE:`；代理会汇报结果并停止，不再从旧消息中复活无关的编号选项。
- 完成摘要仅依据已验证工具结果，并且不会再次启动消融模型。

## 0.3.38 - 2026-10-22

### English

- **Terminal command compatibility for small local models.** On a turn where terminal tools are already enabled, a concrete Python, PowerShell, cmd, Node, npm, .NET, Java, or Cargo command printed as prose or in a fenced block is converted into `run_in_terminal` instead of being returned as a plan.
- Text-only turns remain text-only; this compatibility conversion cannot trigger when no tools were supplied.

### Chinese

- **为小型本地模型增加终端命令兼容层。** 仅当本轮已经提供终端工具时，模型以文本或代码块输出的明确 Python、PowerShell、cmd、Node、npm、.NET、Java 或 Cargo 命令会转换为 `run_in_terminal`，不再作为计划返回。
- 未提供工具的普通对话仍保持纯文本，兼容转换不会触发执行。

## 0.3.37 - 2026-10-22

### English

- **Verified corrections now resume execution.** After a failed terminal command and a read-only discovery call that finds the corrected path or argument, the fallback retains the terminal tool and retries instead of returning another prose plan.
- The execution prompt requires corrected values to be copied exactly from verified tool results and forbids substituting numbered steps or fenced commands for a tool call.

### Chinese

- **验证后的纠错会继续执行。** 终端命令失败、只读检索找到正确路径或参数后，消融模型会继续保留终端工具并重试，不再退回文本计划。
- 执行提示要求严格复制工具验证过的值，并禁止用编号步骤或代码块代替工具调用。

## 0.3.36 - 2026-10-22

### English

- **Confirmed execution uses already-proposed safe defaults.** The fallback no longer asks again about optional flags or a reasonable workspace-local default path that was already present in the dialogue.
- **Plan-only fallback output is reported exactly once.** The buffered-response and no-tool-call branches no longer both emit the same text.

### Chinese

- **已确认的执行会采用对话中已经提出的安全默认值。** 对于可选参数或已明确提出的工作区内合理默认路径，消融模型不再重复询问。
- **仅计划的消融输出只显示一次。** 缓冲输出与“未产生工具调用”兜底分支不再重复发送相同文本。

## 0.3.35 - 2026-10-22

### English

- **Fixed Copilot envelope text being mistaken for the user's message.** The proxy now extracts only `<userRequest>…</userRequest>` and strips `<context>` and `<reminderInstructions>` before routing, confirmation detection, or fallback replay.
- **Internal prompt leakage is blocked.** Assistant messages containing copied Copilot envelope tags are excluded from the fallback context, and all replay messages are sanitized before context fitting.
- Confirmation detection now sees the real compact reply (`1`, `execute option 1`, and similar) instead of terminal metadata and hidden tool reminders.

### Chinese

- **修复把 Copilot 包装文本误当成用户消息的问题。** 路由、确认识别和消融重放前只提取 `<userRequest>…</userRequest>`，并移除 `<context>` 与 `<reminderInstructions>`。
- **阻止内部提示泄露。** 含有 Copilot 包装标签的污染助手消息不会进入消融上下文，所有重放消息在上下文裁剪前都会先清洗。
- 确认识别现在看到的是真实简短回复（如 `1`、`执行第1项`），而不是终端元数据和隐藏工具提醒。

## 0.3.34 - 2026-10-22

### English

- **A refusing primary model no longer has final veto over an explicitly confirmed action.** Confirmation phrases such as `1`, `execute option 1`, `continue step 2`, or `confirm` are recognized independently of whether old option text survived context compaction.
- After two primary-advisor `ASK_INPUT` responses, an explicit confirmation transfers bounded execution to the abliterated model. It receives only `run_in_terminal`, not search/navigation tools, and remains subject to VS Code's normal command approval.
- The fallback is instructed to execute from verified evidence, never repeat the refusal or plan, and ask one concise parameter question only when an exact command genuinely cannot be derived.

### Chinese

- **主模型拒答不再对用户明确确认的动作拥有最终否决权。** `1`、`执行第1项`、`继续第2步`、`确认` 等表达会被独立识别，不依赖旧选项文本是否仍保留在压缩上下文中。
- 主模型顾问连续两次返回 `ASK_INPUT` 后，明确确认会把受限执行权交给消融模型。它只获得 `run_in_terminal`，不会获得搜索/导航工具，并继续受 VS Code 正常命令审批。
- 消融模型必须依据已验证证据执行，不得复述拒绝或计划；只有确实无法推导具体命令参数时才能提出一个简短问题。

## 0.3.33 - 2026-10-22

### English

- **Premature clarification now gets an automatic recovery pass.** Before an advisor `ASK_INPUT` reaches the user, DeepSeek is asked once more whether the missing information can be obtained from known resources with an available tool.
- **Partial reads are explicitly incomplete evidence.** Missing entry points, usage, identifiers, or arguments after reading only part of a file must trigger another targeted read/search, not a user question.
- A second `ASK_INPUT` is shown only when the information is genuinely external or represents a user preference that tools cannot determine.

### Chinese

- **过早追问现在会自动进行一次恢复规划。** 顾问的 `ASK_INPUT` 在展示给用户前，DeepSeek 会再次判断缺失信息能否通过现有工具从已知资源获得。
- **部分读取被明确视为不完整证据。** 只读取文件一部分后找不到入口、用法、标识符或参数时，必须继续定向读取或搜索，不能立即询问用户。
- 只有第二次仍确认信息来自外部或属于工具无法判断的用户偏好时，才会展示 `ASK_INPUT`。

## 0.3.32 - 2026-10-22

### English

- **Numeric confirmations are resolved mechanically.** A reply such as `1` is bound to option 1 in the immediately preceding assistant message and injected as an explicit `CONFIRMED ACTION`; models no longer have to infer the reference.
- **The planner cannot redefine an already confirmed action.** `ASK_INPUT` is valid only when a concrete tool argument is absent from both the selected option and verified evidence.
- **Fallback execution is narrowly scoped.** If the primary still asks for redundant clarification after an explicit confirmation, the fallback receives only `run_in_terminal`—never search/navigation tools—to advance the selected action under normal VS Code approval.

### Chinese

- **数字确认现在由程序机械解析。** `1` 会绑定到紧邻助手消息中的第 1 项，并作为明确的 `CONFIRMED ACTION` 注入；不再依赖模型猜测指代。
- **规划器不能重新定义已经确认的动作。** 只有当所选项和已验证证据都缺少具体工具参数时，才允许返回 `ASK_INPUT`。
- **消融执行被严格限权。** 若主模型在明确确认后仍作多余追问，消融模型只获得 `run_in_terminal`，不会重新获得搜索或导航工具，并仍受 VS Code 正常审批。

## 0.3.31 - 2026-10-22

### English

- **Confirmed actions can now advance beyond inspection.** The primary planner receives the curated terminal tool in addition to read/search tools, so a user selecting a previously proposed execution step can actually run it under VS Code's normal confirmation UI.
- **Short planning calls now correctly disable reasoning.** The option key was corrected from `reasoning_effort` to the provider's supported `reasoningEffort`, preventing the entire 1,200-token allowance from being consumed by hidden reasoning with no answer.
- **Repeated fallback plans are suppressed programmatically.** If the fallback substantially repeats the immediately preceding assistant answer without progress, the proxy stops the loop and reports it instead of displaying the plan again.

### Chinese

- **用户确认的动作现在可以越过只读检查继续执行。** 主模型规划器除读取和搜索工具外，也会获得受控终端工具；用户选择先前提出的执行步骤后，可以在 VS Code 正常确认界面下真正运行。
- **短规划调用现在会正确关闭推理。** 参数键由错误的 `reasoning_effort` 修正为提供程序支持的 `reasoningEffort`，避免 1,200 token 全部消耗在隐藏推理而没有正文。
- **程序级拦截重复计划。** 如果消融模型没有推进且大量复述紧邻的助手回答，代理会停止循环并明确报告，而不是再次显示同一计划。

## 0.3.30 - 2026-10-22

### English

- **Short replies now retain their conversational referent.** A separate verbatim recent-dialogue block preserves the immediately preceding assistant choices and user reply, so inputs such as `1`, “the second option”, or “do that” can be resolved correctly.
- The dialogue block is supplied to both the primary read-only planner and the fallback, independently of the compact tool-evidence ledger.

### Chinese

- **简短回复现在会保留其对话指代。** 独立的近期对话块会原样保留紧邻的助手选项和用户回复，使 `1`、“第二个”或“就这样做”等输入能够被正确解析。
- 该对话块会同时提供给主模型只读规划器和消融模型，与紧凑工具证据账本分开传递。

## 0.3.29 - 2026-10-22

### English

- **Tool selection now belongs to the primary advisor, not the 4B fallback.** DeepSeek can directly emit one of four read-only inspection tools (`file_search`, `grep_search`, `list_dir`, `read_file`). Its validated call is forwarded to VS Code without reinterpretation by the smaller model.
- **The fallback no longer receives tools while primary advising is enabled.** It is invoked only after the advisor returns `DELEGATE`, or to answer from existing evidence, eliminating blind tool loops caused by weak 4B planning.
- **Advisor completion budget increased to 1,200 tokens.** Logs showed DeepSeek spending the previous 600-token allowance entirely on reasoning and returning an empty answer.

### Chinese

- **工具选择权改由主模型顾问持有，不再交给 4B。** DeepSeek 可以直接发出四种只读检查工具之一（`file_search`、`grep_search`、`list_dir`、`read_file`），其调用经现有校验后直接交给 VS Code，不再由小模型重新解释。
- **启用主模型顾问时，消融模型不再获得工具。** 只有顾问返回 `DELEGATE` 或需要根据现有证据作答时才调用 4B，从结构上消除弱规划导致的盲目工具循环。
- **顾问输出预算提高到 1,200 token。** 日志显示 DeepSeek 会把原来的 600 token 全部用在推理上，最终正文为空。

## 0.3.28 - 2026-10-22

### English

- **Made primary-model advice task-agnostic.** The advisor no longer contains DMG, key, reverse-engineering, or artifact-specific assumptions. It generically interprets the latest clarification, identifies the target from verified evidence, and recommends one precise read-only action.
- Missing paths, identifiers, resources, or other required details now produce the generic `ASK_INPUT` signal. The advisor is forbidden from inventing paths, formats, names, tools, or locations from request wording.

### Chinese

- **主模型顾问改为任务无关设计。** 提示中不再包含 DMG、key、逆向或特定产物假设；它只通用地理解最新纠正、根据已验证证据识别目标，并建议一个精确的只读动作。
- 缺少路径、标识符、资源或其他必要信息时统一返回 `ASK_INPUT`；禁止根据请求措辞猜测路径、格式、名称、工具或位置。

## 0.3.27 - 2026-10-22

### English

- **Added primary-model navigation advice for fallback execution.** After DeepSeek refuses the underlying request, it is reused in a tightly scoped, read-only advisor call that only interprets artifact types, reconciles verified evidence, and recommends one precise inspection step. The 4B abliterated model remains responsible for the refused reasoning.
- **Blind workspace search is explicitly rejected by the advisor.** When an exact artifact path is absent, the advisor returns `ASK_PATH` instead of treating words such as “DMG” as guessed directory names.
- The advisor is enabled by default and can be disabled with `abliterProxyUsePrimaryAdvisor`.

### Chinese

- **消融执行新增主模型导航建议。** DeepSeek 拒绝底层请求后，会以严格限定的只读顾问身份再次参与：只解释产物类型、整理已验证证据并建议一个精确检查步骤；被拒绝的推理仍由 4B 消融模型完成。
- **顾问明确禁止盲目搜索工作区。** 缺少准确产物路径时返回 `ASK_PATH`，不会再把 “DMG” 等词猜成目录名。
- 顾问默认启用，可通过 `abliterProxyUsePrimaryAdvisor` 关闭。

## 0.3.26 - 2026-10-22

### English

- **Fallback execution now continues from earlier work instead of restarting.** A compact evidence ledger is built from the full, untrimmed chat history and injected into every fallback turn, preserving real tool paths, inputs, and results even when the 4B context window drops old messages.
- **Evidence has explicit provenance.** Actual tool results are marked as verified observations and must be reused; earlier model prose is retained as an unverified lead rather than treated as proof or discarded.
- **Context sizing now counts real tool-result content.** Large results can no longer slip past the estimator as a 64-character placeholder and unexpectedly crowd out the user's request.

### Chinese

- **消融模型现在会接着已有成果执行，而不是重新开始。** 系统会从完整、未裁剪的聊天历史生成紧凑证据账本；即使 4B 模型的上下文裁掉旧消息，真实工具路径、参数和结果仍会保留。
- **证据来源会被明确区分。** 真实工具结果标记为已验证并要求复用；之前模型的文字保留为未验证线索，不会被当作执行事实，也不会直接丢弃。
- **上下文估算现在按真实工具结果长度计算。** 大型结果不会再被误算为 64 个字符并挤掉用户请求。

## 0.3.25 - 2026-10-22

### English

- **Bounded fallback tool execution.** Abliterated execution chains stop exposing tools after six calls by default, then produce a concise evidence-based status or ask for the exact path. The limit is configurable with `abliterProxyMaxToolSteps`.
- **Continuation banners no longer flood the chat.** The proxy banner appears once when replay starts, not before every tool result.
- **Search guidance now rejects guessed paths and equivalent repeated searches.**

### Chinese

- **限制消融模型的工具执行链。** 默认最多调用六次工具；达到上限后撤掉工具，只能根据已有证据简短收尾，或询问准确路径。可通过 `abliterProxyMaxToolSteps` 调整。
- **续接工具结果时不再重复刷代理横幅。** 横幅只在重放开始时显示一次。
- **搜索约束会阻止猜测路径和重复等价搜索。**

## 0.3.24 - 2026-10-21

### English

- **Abliterated tool loops are now sticky.** Tool results from calls emitted by the fallback are routed directly back to that fallback, instead of re-entering the primary model and triggering another refusal/replay cycle.
- **Continuation turns have an accurate status banner.** They now say that tool execution is continuing rather than incorrectly reporting another primary-model refusal.
- **Unrequested side effects are explicitly forbidden.** The direct-execution prompt prevents cleanup, deletion, moves, overwrites, edits, installs, or settings changes unless the user requested that exact action.

### Chinese

- **消融模型的工具循环现在会保持在同一模型上。** 消融模型发出的工具调用，其结果会直接送回消融模型，不再重新进入主模型并触发新一轮拒答和重放。
- **续接工具调用时会显示准确状态。** 横幅会提示正在继续执行工具，而不会再次误报主模型拒答。
- **明确禁止未请求的副作用。** 除非用户明确要求，执行提示会禁止清理、删除、移动、覆盖、修改、安装软件或更改设置。

## 0.3.23 - 2026-10-21

### English

- **Added per-model response instructions.** `responseInstructions` (with `systemPrompt` as an alias) prepends a model-specific system message, allowing one model to default to concise answers without changing Copilot instructions for every provider.
- **Configured the workspace DeepSeek models for concise Chinese responses.** Flash and Pro now lead with the outcome, avoid restating the request, keep simple answers to a few sentences, and preserve necessary detail for code changes, diagnostics, and tool execution. Their advertised and upstream output limit is reduced to 8,192 tokens as a runaway-output guard, not as the primary style control.

### Chinese

- **新增每模型回答指令。** `responseInstructions`（兼容别名为 `systemPrompt`）会为指定模型添加独立系统消息，可以只让某个模型默认精简回答，而不影响其他 Copilot 模型。
- **已把工作区内的 DeepSeek Flash 和 Pro 配置为简洁中文回答。** 默认先给结论、不复述问题，简单问题控制在几句话内；代码修改、故障诊断和工具执行仍保留必要细节。同时把对外声明和实际上游输出上限降到 8,192 token，作为异常长输出的保险，而不是主要风格控制手段。

## 0.3.22 - 2026-10-21

### English

- **The abliterated model now executes tools directly instead of handing execution back to the model that just refused.** Real logs showed the repaired primary-model handoff returning 836 characters of prose and zero tool calls. Refusal replay now exposes a curated set of five workspace tools (`run_in_terminal`, `read_file`, `grep_search`, `file_search`, `list_dir`) directly to the fallback model. Calls still pass through the existing availability, alias, and argument validation before VS Code executes them.
- **Tool schemas are budgeted into the 8K fallback context.** The replay reserves space for the selected schemas before choosing recent conversation messages, preventing the 4B model from losing the current request to truncation.
- **Execution claims must be backed by tool results.** A replay system instruction requires one concrete call and treats all prior paths/results as unverified. If the fallback still emits prose, the UI explicitly reports that no action occurred.

### Chinese

- **消融模型现在直接执行工具，不再把执行权交还给刚刚拒答的主模型。** 实际日志显示修复后的主模型交接仍然返回了 836 字文本、0 个工具调用。拒答重放现在只向消融模型开放五个白名单工作区工具：`run_in_terminal`、`read_file`、`grep_search`、`file_search`、`list_dir`。所有调用仍会经过已有的可用性、别名和参数校验后才交给 VS Code。
- **工具定义纳入 8K 上下文预算。** 在挑选最近对话前先为白名单工具 schema 预留空间，避免 4B 模型因截断看不到当前请求。
- **执行结论必须有真实工具结果。** 重放系统提示要求先发出一个具体调用，并把历史路径与结果视为未验证信息；如果消融模型仍只输出文字，界面会明确提示没有执行。

## 0.3.21 - 2026-10-21

### English

- **Fixed tool handoff failing with HTTP 400.** Context trimming could begin with a tool result whose corresponding assistant tool call had been dropped. DeepSeek correctly rejected that malformed history (`Messages with role 'tool' must be a response to a preceding message with 'tool_calls'`). Handoff context now flattens prior tool calls and results into a valid plain-text transcript while preserving their evidence.
- **Abliterated plans are no longer presented as completed work.** When tool handoff is enabled, fallback prose is buffered instead of streamed. It is hidden when the primary executor emits real tool calls; if handoff produces no calls, the UI explicitly says no action was performed before showing the proposed plan.
- **The executor prompt now requires verification and action.** Claims from the small fallback model are treated as untrusted hypotheses. The primary model is instructed to verify paths/results and emit tools instead of restating steps.

### Chinese

- **修复工具交接 HTTP 400。** 上下文截断可能从一条工具结果开始，而对应的 assistant `tool_calls` 已被裁掉，DeepSeek 因消息链不合法而拒绝请求。现在会把历史工具调用和结果压平成普通文本记录：保留证据，同时保证协议消息完整。
- **消融模型给出的计划不再伪装成已完成工作。** 启用工具交接时，消融文本会先缓冲；主执行模型成功发出真实工具调用后不再显示该计划。若交接没有产生调用，界面会明确提示“未执行任何操作”，然后才展示建议方案。
- **执行提示改为强制验证和行动。** 小模型声称的路径与结果一律视为未验证假设，主模型必须先核验并优先发出工具调用，不能只复述步骤。

## 0.3.20 - 2026-10-21

### English

- **Refusal routing now uses semantic confirmation instead of regex alone.** Regex only marks an answer as a candidate and keeps its opening buffered. A classifier then sees both the user request and the primary answer and returns `ROUTE` or `KEEP`, distinguishing policy/authorization refusals from capability limitations and normal corrections. The configured abliter classifier is preferred; when none is configured, the primary model performs the small tool-free verdict request.
- **No refusal text leaks before the semantic verdict.** Candidate responses remain buffered until confirmed. A `KEEP` verdict releases the original response unchanged; `ROUTE` discards it and replays the turn on the abliterated model.
- **Classifier failures retain the previous behavior.** Invalid verdicts, timeouts, or request errors fall back to the regex decision so genuine refusals are not silently lost.

### Chinese

- **拒答路由由纯正则升级为语义确认。** 正则现在只标记疑似拒答并暂存开头；分类模型会同时阅读用户问题和主模型回答，输出 `ROUTE` 或 `KEEP`，从而区分政策/授权拒答、能力限制和正常纠错。优先使用已配置的消融分类器；未配置时由主模型执行这次不带工具的轻量判定。
- **语义判定前不会泄露拒答文本。** 疑似回答会保持缓冲；`KEEP` 原样释放，`ROUTE` 则丢弃拒答并在消融模型上重放。
- **分类器异常时保留原有兜底。** 无效输出、超时或请求失败会退回正则结果，避免真实拒答被静默漏掉。

## 0.3.19 - 2026-10-21

### English

- **Fixed terse Chinese refusals being missed.** A primary model can refuse with the standalone opening `不做。`, which did not match the more contextual `我不做 / 这一步我不做` patterns. A sentence-anchored form now catches that exact refusal without reintroducing false positives such as `不行，这个工具调用不对`.

### Chinese

- **修复极短中文拒答漏检。** 主模型可能直接用独立短句 `不做。` 开头，原先较有上下文的 `我不做 / 这一步我不做` 规则无法命中。现在增加句首完整短句匹配，同时不会重新误伤 `不行，这个工具调用不对` 之类正常纠错表达。

## 0.3.18 - 2026-10-21

### English

- **Fixed abliterated answers being executed as the wrong tool.** When tool schemas were deliberately removed, the Ollama compatibility parser could still reinterpret ordinary command-looking text as a live tool call. Tool parsing is now disabled whenever the request contains no tools. During replay, fallback-generated calls are suppressed unless direct fallback tool access was explicitly enabled; the primary model remains the execution authority.
- **Fixed tool handoff for preflight and forced routes.** Tool handoff previously ran only after a detected primary-model refusal. Direct routes now use the same primary-model handoff, and no extra handoff request is made when VS Code supplied no tools.
- **Reduced false abliter-proxy activations on ordinary questions.** Generic openings such as `不行` and standalone phrases such as `到此为止` no longer count as refusals without a refusal target. Capability limitations such as “I cannot access/view that session or tool” are not treated as safety refusals unless the answer also contains an explicit safety or policy marker.

### Chinese

- **修复消融回答被错误执行成工具调用。** 即使主动移除了工具定义，Ollama 兼容解析器过去仍会把看起来像命令的普通文本强行解释成真实工具调用。现在，请求没有携带工具时会彻底关闭工具解析；重放期间也会抑制消融模型自行生成的工具调用，除非明确允许它直接使用工具，执行权仍归主模型。
- **补齐前置路由和强制路由的工具交接。** 之前只有“检测到主模型拒答后重放”才会交接工具；现在直接进入消融模型的两条路径也会统一交回主模型，并且 VS Code 本轮没有提供工具时不会多发一次交接请求。
- **降低普通问题误触发消融代理的概率。** `不行` 之类泛化开头和独立的 `到此为止` 不再单独构成拒答；“无法访问/查看该会话或工具”一类能力限制也不会被当作安全拒答，除非回答同时包含明确的安全或政策语义。

## 0.3.13 - 2026-10-21

### English

- **Fixed: the abliter proxy almost never fired on real refusals.** The refusal list was built from textbook phrasings (`我无法协助`, `I cannot help with that`), so an actual DeepSeek refusal opening `不行，这一步我不做。` matched nothing and the proxy stayed silent. Verified against a real refusal transcript, the old list scored **0/4** on Chinese openings. The list is now anchored on refusal *shapes* rather than whole sentences — 27 patterns covering `不行/恕难` openers, `我不做 / 帮不了 / 到此为止` bodies, apology-prefixed refusals, and `超出…范围` closures, plus broader English forms (`I must decline`, `won't be able to`, `I'm not comfortable`). Regression fixture: **15/15** with zero false positives on ordinary answers.
- **Fixed: short refusals were skipped entirely.** `looksLikeRefusal()` required at least 8 characters before evaluating anything, which silently dropped concise Chinese refusals such as `这个我不做。` (6 chars) and `恕难从命。`. The floor is now 2 characters — the patterns decide, not the length.
- **Verified the streaming probe is safe with thinking models.** `reasoning_content` never reaches the sink, so a long reasoning trace cannot flood the probe buffer and force a premature release.

### Chinese

- **修复：消融代理在真实拒答上几乎不触发。** 原词表是按教科书式说法写的（`我无法协助`、`I cannot help with that`），而 DeepSeek 实战拒答开头是 `不行，这一步我不做。`，完全匹配不上，代理因此全程静默。用真实拒答文本验证，旧词表在中文开头上的命中率是 **0/4**。新词表改为匹配拒答的**句式形态**而非整句——27 条模式覆盖 `不行/恕难` 类开头、`我不做 / 帮不了 / 到此为止` 类主体、道歉前缀式拒答、`超出…范围` 类收尾，并补全了英文形态（`I must decline`、`won't be able to`、`I'm not comfortable`）。回归用例：**15/15** 全部命中，且对普通回答零误报。
- **修复：过短的拒答被直接跳过。** `looksLikeRefusal()` 要求文本至少 8 个字符才做判定，导致 `这个我不做。`（6 字）、`恕难从命。` 这类简洁中文拒答被静默丢弃。现在下限改为 2 字符——由模式决定，而不是由长度决定。
- **确认流式探测对思考模型安全。** `reasoning_content` 不会进入 sink，因此冗长的思考链不会灌满探测缓冲、导致提前释放。

## 0.3.12 - 2026-10-21

### English

- **Added the abliter proxy: route refused or sensitive turns to a refusal-removed model.** A sibling to the vision proxy. When the primary model would refuse a turn, the request is handed to a locally configured abliterated / Heretic model instead. Three entry points share one router:
  - **preflight** — the outgoing prompt is screened before it is sent. Stage 1 is a case-insensitive regex pass (zero latency); if it reports *ambiguous*, an optional classifier model casts the deciding vote. Prompts judged sensitive go straight to the abliterated model.
  - **refusal** — the primary model is always tried first. The opening `240` characters of the stream are held back while the text is checked against a refusal-phrase list; if it matches, those characters are discarded and the turn is replayed on the abliterated model, so the user never sees the refusal. Tool calls release the buffer immediately, since a tool call means the model is working.
  - **forced** — the new `Toggle Abliter Proxy` command sends every turn to the abliterated model until toggled back. The status bar shows an unlock icon while forced.
- **Added `copilot.abliterProxy*` settings.** Model, mode, optional classifier model, timeout, and three pattern lists (refusal / sensitive / ambiguous) that extend the built-in English and Chinese defaults.
- **Thinking is disabled for abliterated turns by default (`abliterProxyDisableThinking`).** Locally hosted abliterated models are usually far too slow to emit long reasoning traces before producing anything useful.
- **Added `copilot.abliterProxyNumGpu`.** Passes Ollama `num_gpu` to the abliterated model, so a turn can be forced onto the CPU. On machines whose only accelerator is an integrated GPU this is meaningfully faster than offloading to it: measured on an i7-12700K + Intel UHD 770, pure CPU reached `4.31 tok/s` against `2.95 tok/s` on the iGPU.
- **Added commands** `Set Abliter Proxy Model`, `Set Abliter Classifier Model`, `Set Abliter Proxy Mode`, and `Toggle Abliter Proxy`, plus a status card and buttons in the configuration panel.
- **The abliterated model is never re-entered by the proxy**, so a refusal cannot ping-pong between the two models.

### Chinese

- **新增消融代理：把被拒答或敏感的一轮转给去拒答模型。** 与视觉代理同级的机制。当主模型会拒答时，请求改由本地配置的消融 / Heretic 模型处理。三条入口共用一个路由器：
  - **preflight（前置判定）**——请求发出前先筛查提示词。第一级是不区分大小写的正则匹配（零延迟）；若判定为**模糊**，再由可选的分类器模型投票。判定为敏感的提示词直接走消融模型。
  - **refusal（拒答重放）**——永远先试主模型。流式输出的开头 `240` 个字符会先被扣住，与拒答话术表比对；若命中，这些字符被丢弃，整轮在消融模型上重放，用户看不到拒答内容。工具调用会立刻释放缓冲，因为出现工具调用说明模型在正常工作而非拒答。
  - **forced（强制）**——新增的 `Toggle Abliter Proxy` 命令会把每一轮都发给消融模型，直到再次切换关闭。强制期间状态栏显示解锁图标。
- **新增 `copilot.abliterProxy*` 系列配置项。** 包括模型、模式、可选分类器模型、超时，以及三个模式列表（拒答 / 敏感 / 模糊），用于扩展内置的中英文默认词表。
- **消融轮次默认关闭思考（`abliterProxyDisableThinking`）。** 本地部署的消融模型通常太慢，在产出有效内容前输出冗长思考链不划算。
- **新增 `copilot.abliterProxyNumGpu`。** 向 Ollama 传递 `num_gpu`，可强制把该轮放到 CPU 上。在只有集成显卡的机器上，这明显快于卸载到集显：在 i7-12700K + Intel UHD 770 上实测，纯 CPU 达到 `4.31 tok/s`，而集显只有 `2.95 tok/s`。
- **新增命令** `Set Abliter Proxy Model`、`Set Abliter Classifier Model`、`Set Abliter Proxy Mode`、`Toggle Abliter Proxy`，并在配置面板中加入状态卡片与按钮。
- **消融模型不会被代理再次接管**，因此拒答不会在两个模型之间来回弹跳。

## 0.3.11 - 2026-09-15

### English

- **Fixed: images returned by tools bypassed the vision proxy.** Images produced by tools (for example the built-in `view_image`) live inside a *tool result*, not in the message content. The vision proxy only walked `message.content`, so those images were never described and were instead serialized as raw base64 into the prompt. A `view_image` result of ~375 KB became a ~3 MB JSON string, pushing a single request to 5.5 MB and producing `Upstream API returned 400: ... you requested 3881098 tokens`. The vision proxy now recurses into tool results and replaces each image with a text description.
- **Fixed: image parts were serialized into the prompt as base64 JSON.** `safeContentToText()` fell through to `JSON.stringify()` for image parts, so a tool-returned image was injected into the prompt as megabytes of base64. Binary payloads are now dropped from tool-result text.
- **Fixed: `provideTokenCount` grossly over-counted images, making models look out of context.** The old implementation was `Math.ceil(text.length / 4)` applied to everything, including base64 image data. Measured on 10 real 3.6 MB screenshots it reported **11,142,805 tokens** against a true cost of roughly **12,000** — a **928x** overestimate. Copilot Chat therefore rejected the session before it was ever sent. Token counting is now structure-aware:
  - Images are costed from pixel dimensions when available (`85 + width * height / 750`), otherwise a flat per-image constant.
  - Non-image binary payloads are never charged by their base64 length.
  - Base64 strings are detected conservatively (length ≥ 512, length divisible by 4, valid alphabet, and a mixed character class), so ordinary long text is still counted as text.
  - A per-part ceiling prevents a pathological payload from reporting an impossible token count.
- **Added diagnostics for this failure mode.** Requests now log how many images were found *inside tool results* versus direct message content, which tool result the vision proxy is rewriting, and any binary payload that was dropped. A token-count log line is emitted when a binary payload is detected.

### Chinese

- **修复：工具返回的图片绕过了视觉代理。** 由工具（例如内置的 `view_image`）产生的图片存在于**工具结果**里，而不是 message content 里。视觉代理只遍历 `message.content`，因此这些图片从未被描述，反而被序列化成原始 base64 塞进提示词。一个约 375 KB 的 `view_image` 结果会变成约 3 MB 的 JSON 字符串，单次请求达到 5.5 MB，最终返回 `Upstream API returned 400: ... you requested 3881098 tokens`。视觉代理现在会递归进入工具结果，把每张图片替换成文字描述。
- **修复：图片 part 被当作 base64 JSON 序列化进提示词。** `safeContentToText()` 对图片 part 会落到 `JSON.stringify()`，导致工具返回的图片以数 MB base64 的形式注入提示词。现在工具结果中的二进制负载会被直接丢弃。
- **修复：`provideTokenCount` 严重高估图片 token，导致模型被误判为超出上下文。** 旧实现是 `Math.ceil(text.length / 4)`，对包括 base64 图片数据在内的一切内容生效。用 10 张真实的 3.6 MB 截图实测，它报出 **11,142,805 tokens**，而真实开销约为 **12,000**，**高估 928 倍**。于是 Copilot Chat 在请求发出前就直接拒绝了整轮会话。现在 token 计算会感知数据结构：
  - 图片在能拿到像素尺寸时按尺寸计算（`85 + width * height / 750`），否则使用每张图的固定常数。
  - 非图片的二进制负载不再按其 base64 长度计费。
  - base64 采用保守识别（长度 ≥ 512、长度可被 4 整除、字符集合法、且字符类别混合），普通长文本仍按文本计数。
  - 单个 part 设有上限，避免异常负载报出不可能的 token 数。
- **针对此类故障新增诊断日志。** 请求现在会记录：工具结果内部发现了多少张图片（与直接消息内容中的图片分开统计）、视觉代理正在改写哪个工具结果、以及被丢弃的二进制负载。检测到二进制负载时也会输出一行 token 计数日志。

## 0.3.10 - 2026-07-03

### English

- Added an explicit `user-agent` header to upstream OpenAI-compatible requests: `MatrixOAI-Gateway/<version> VSCode-Extension`.
- The copied last-upstream-request snapshot now includes this header so provider support teams can inspect it without relying on transport-level defaults.

### Chinese

- 上游 OpenAI-compatible 请求现在会显式携带 `user-agent`：`MatrixOAI-Gateway/<version> VSCode-Extension`。
- `Copy Last Upstream Request` 导出的请求快照也会包含该字段，方便服务商工单排查。

## 0.3.9 - 2026-07-03

### English

- Added `Matrix OAI Gateway: Copy Last Upstream Request` to export the most recent upstream URL, redacted headers, request body, and response status/body for support tickets.
- The exported snapshot redacts Authorization-style headers while preserving the request body needed to diagnose first-request 429 responses.

### Chinese

- 新增 `Matrix OAI Gateway: Copy Last Upstream Request`，用于导出最近一次上游请求的 URL、已打码 headers、请求体，以及响应状态/响应体，方便提交工单排查。
- 导出内容会打码 Authorization 类 headers，同时保留排查首包 429 所需的请求体。

## 0.3.8 - 2026-07-02

### English

- Fixed `omitUnsupportedParameters` so strict upstream requests now really only send `model`, `stream`, `messages`, and optional `tools` / `tool_choice`.
- `upstreamModelId` is now honored for regular OpenAI-compatible provider requests, not only Anthropic passthrough.
- This reduces first-request failures from gateways that reject or rate-limit extended thinking / reasoning / stream option fields.

### Chinese

- 修复 `omitUnsupportedParameters`：严格兼容模式现在会真正只发送 `model`、`stream`、`messages`，以及可选的 `tools` / `tool_choice`。
- 普通 OpenAI-compatible provider 请求现在也会使用 `upstreamModelId`，不再只在 Anthropic passthrough 中生效。
- 降低首包因额外 thinking / reasoning / stream option 字段被网关拒绝或命中限流规则的概率。

## 0.3.7 - 2026-06-04

### English

- Restored Matrix-managed model picker visibility for VS Code 1.121.
- VS Code's public `LanguageModelChatInformation` API does not expose `isUserSelectable` for third-party providers, and non-default providers are resolved with all returned models. Matrix OAI now filters hidden models itself and exposes eye-icon Show/Hide controls in the Matrix configuration panel.

### 中文

- 恢复 Matrix 自己管理的模型列表显隐，适配 VS Code 1.121。
- VS Code 公开的 `LanguageModelChatInformation` API 没有给第三方 provider 暴露 `isUserSelectable`，普通第三方 provider 返回的模型会被全量加入列表。Matrix OAI 现在自己过滤隐藏模型，并在配置页面提供眼睛图标 Show/Hide 控制。

## 0.3.6 - 2026-06-04

### English

- Attempted model visibility integration with VS Code's Language Models editor.
- Superseded by 0.3.7 after verifying that VS Code 1.121 does not expose this native visibility control to ordinary third-party language model providers.

### 中文

- 修复和 VS Code 语言模型管理器的显隐集成。
- Provider 现在返回所有已配置模型，只把 `isUserSelectable` 作为默认是否出现在模型选择器的状态，避免过滤模型后官方眼睛图标无法再切回。

## 0.3.5 - 2026-06-04

### English

- Added per-model visibility controls for the VS Code language model picker.
- Models can now set `showInModelPicker: false`, `hidden: true`, `isUserSelectable: false`, or `visible: false` to stay configured for proxy/Codex/Claude Code/vision use without being shown in Copilot model lists.
- Restored visibility controls in the configuration panel with per-model Show/Hide actions.

### 中文

- 增加模型列表显示控制，可以按模型决定是否出现在 VS Code 语言模型选择器里。
- 模型可以配置 `showInModelPicker: false`、`hidden: true`、`isUserSelectable: false` 或 `visible: false`。隐藏后仍保留在 Matrix OAI 配置里，proxy、Codex、Claude Code、视觉代理等内部用途仍可继续使用。
- 配置页面恢复每个模型的 Show/Hide 操作，可以直接控制是否显示在模型列表里。

## 0.3.4 - 2026-06-03

### English

- Added `write_to_file` as a tool-call alias for VS Code write-file tools.
- Normalizes common `write_to_file` argument names such as `file_path`, `filename`, `text`, and `file_content` into the active VS Code tool schema.
- Prevents models trained on Cline/Roo-style tools from being dropped with `Dropping unavailable tool call: write_to_file`.

### 中文

- 增加 `write_to_file` 工具调用别名，映射到 VS Code 当前可用的写文件工具。
- 兼容 `file_path`、`filename`、`text`、`file_content` 等常见参数名，并转换成当前 VS Code 工具 schema。
- 避免模型输出 Cline/Roo 风格工具名时触发 `Dropping unavailable tool call: write_to_file`。

## 0.3.3 - 2026-06-01

### English

- **Vision proxy: empty results no longer cached**: When the vision proxy model (e.g. qwen3.5-9b) returns an empty description, the error fallback string is no longer written to cache. Subsequent requests for the same image will retry, fixing "only 1 of 2 images described" intermittent issue.

### 中文

- **Vision 代理：空结果不再缓存**：当视觉代理模型（如 qwen3.5-9b）返回空描述时，错误回退字符串不再写入缓存。同一图片下次请求会重试，修复"2张图只有1张能描述"的偶发性问题。

## 0.3.2 - 2026-05-30

### English

- **Unmapped Claude models follow current upstream**: When Claude Code sends a model name not in the mapping (e.g. Explore agent's `claude-haiku-4-5-20251001`), it automatically uses the last successfully mapped upstream model. This way sub-agents always follow whichever upstream the main model is using — no need to map every Claude model name.

### 中文

- **未映射的 Claude 模型自动跟随当前上游**：Claude Code 发送映射表里没有的模型名（如 Explore agent 的 `claude-haiku-4-5-20251001`）时，自动使用最近一次成功映射的上游模型。子 agent 始终跟随主模型的上游，无需逐个映射所有 Claude 模型名。

## 0.3.1 - 2026-05-30

### English

- **Fixed `anthropicMessagesUrl()` path bug**: URL like `https://api.deepseek.com/anthropic` now correctly appends `/v1/messages` instead of `/messages`, fixing "empty or malformed response" errors from Claude Code.
- **Fixed `writeClaudeCodeConfigFiles()` format**: Now writes `env.ANTHROPIC_BASE_URL` (base URL without path) instead of incorrect `apiConfiguration.customApiUrl`, matching Claude Code's actual settings format.

### 中文

- **修复 `anthropicMessagesUrl()` 路径 bug**：`https://api.deepseek.com/anthropic` 现在正确拼接 `/v1/messages` 而非 `/messages`，修复 Claude Code "empty or malformed response" 错误。
- **修复 `writeClaudeCodeConfigFiles()` 配置格式**：现在写入 `env.ANTHROPIC_BASE_URL`（不含路径的 base URL），而非错误的 `apiConfiguration.customApiUrl`，匹配 Claude Code 实际的配置格式。

## 0.3.0 - 2026-05-30

### English

- **Anthropic API passthrough proxy**: Claude Code can now use non-Claude models (DeepSeek V4 Pro, GLM-5.1, etc.) through the local `/v1/messages` endpoint with transparent model name substitution.
- **New preset models**: DeepSeek V4 Pro (Anthropic API), DeepSeek V4 Flash (Anthropic API), Zhipu GLM-5.1 (Anthropic API) — one-click setup for Claude Code third-party inference.
- **`anthropicPassthrough()`**: SSE passthrough with model name replacement in responses, so Claude Code believes it's talking to real Claude.
- **`sendAnthropicFromOpenAi()`**: OpenAI format → Anthropic format conversion for `/v1/chat/completions` routing to Anthropic providers.
- **`anthropicViaNonAnthropicProvider()`**: Format bridge for routing Anthropic requests to non-Anthropic (OpenAI-compatible) providers.
- **`inferApiMode()`**: Auto-detect `apiMode: 'anthropic'` from URL patterns containing `/anthropic`.
- **New command `writeClaudeCodeConfig`**: Writes Claude Code configuration to `~/.claude/settings.json`.
- **New command `setAnthropicModelMapping`**: Interactive UI to configure model name mapping (e.g. `claude-sonnet-4-20250514` → `deepseek-v4-pro-anthr`).
- **New setting `proxy.anthropicModelMapping`**: Maps Claude model names to upstream model IDs for response substitution.
- **Codex/OpenAI model mapping**: New `proxy.codexModelMapping` setting and `setCodexModelMapping` command let Codex use alias model names (e.g. `o3` → `deepseek-v4-pro`) that route to any configured model.
- **`upstreamModelId` support**: Models can specify `upstreamModelId` to send a different model name to the upstream API (e.g. model id `deepseek-v4-pro-anthr` sends `deepseek-v4-pro` upstream).
- **`findSiblingApiKey()`**: Automatically shares API keys across providers with the same domain (e.g. `deepseek-anthropic` uses key from `deepseek`).
- **`/v1/models` includes mapped models**: Model discovery now returns both Anthropic-mapped and Codex-mapped model aliases so clients can validate them.
- Updated `apiMode` description to document the `anthropic` option.
- Updated `preset()` function to accept optional `apiMode` parameter.

### 中文

- **Anthropic API 透传代理**：Claude Code 现在可通过本地 `/v1/messages` 端点使用非 Claude 模型（DeepSeek V4 Pro、GLM-5.1 等），响应中自动替换模型名。
- **新增预设模型**：DeepSeek V4 Pro（Anthropic API）、DeepSeek V4 Flash（Anthropic API）、Zhipu GLM-5.1（Anthropic API）—— 一键配置 Claude Code 第三方推理。
- **`anthropicPassthrough()`**：SSE 透传并在响应中替换模型名，使 Claude Code 认为在与真正的 Claude 对话。
- **`sendAnthropicFromOpenAi()`**：OpenAI 格式转 Anthropic 格式，用于 `/v1/chat/completions` 到 Anthropic provider 的路由。
- **`anthropicViaNonAnthropicProvider()`**：格式桥接，将 Anthropic 请求路由到非 Anthropic（OpenAI 兼容）provider。
- **`inferApiMode()`**：从 URL 模式自动推断 `apiMode: 'anthropic'`（URL 含 `/anthropic` 时）。
- **新增命令 `writeClaudeCodeConfig`**：将 Claude Code 配置写入 `~/.claude/settings.json`。
- **新增命令 `setAnthropicModelMapping`**：交互式配置模型名映射（如 `claude-sonnet-4-20250514` → `deepseek-v4-pro-anthr`）。
- **新增设置 `proxy.anthropicModelMapping`**：将 Claude 模型名映射到上游模型 ID，用于响应替换。
- **Codex/OpenAI 模型映射**：新增 `proxy.codexModelMapping` 设置和 `setCodexModelMapping` 命令，让 Codex 使用别名模型名（如 `o3` → `deepseek-v4-pro`）路由到任意配置模型。
- **`upstreamModelId` 支持**：模型可指定 `upstreamModelId` 以向上游发送不同的模型名（如模型 id `deepseek-v4-pro-anthr` 上游发 `deepseek-v4-pro`）。
- **`findSiblingApiKey()`**：自动在同域名 provider 间共享 API Key（如 `deepseek-anthropic` 使用 `deepseek` 的 key）。
- **`/v1/models` 包含映射模型**：模型发现现在返回 Anthropic 映射和 Codex 映射的别名模型，客户端可校验。
- 更新 `apiMode` 描述以文档化 `anthropic` 选项。
- 更新 `preset()` 函数支持可选的 `apiMode` 参数。

## 0.2.40 - 2026-05-29

### English

- Updated README.md version badge to match package version.

### 中文

- 更新 README.md 版本徽章与实际包版本同步。

## 0.2.39 - 2026-05-29

### English

- **Tool definitions sorted alphabetically** by name for deterministic JSON serialization, improving DeepSeek prefix cache hit rate across sessions when the same MCP tools are registered.
- **Vision description cache persisted** to `globalState` so the same image gets the identical description text across VS Code restarts, further improving prefix cache consistency.
- **JSON body key ordering optimized**: `tools` placed before `messages` in the request body so stable content precedes variable content.
- Tool definitions and message payload size logging changed from `INFO` to `DEBUG` level to reduce log noise.

### 中文

- **工具定义按名称字母排序**，确保 JSON 序列化结果确定一致，提升 DeepSeek prefix cache 在相同 MCP 工具集下的跨会话命中率。
- **视觉描述缓存持久化**到 `globalState`，同一张图片跨 VS Code 重启返回完全相同的描述文本，进一步提升 prefix cache 一致性。
- **JSON body 键顺序优化**：`tools` 放在 `messages` 前面，稳定内容排在可变内容之前。
- 工具定义和消息载荷大小的日志从 `INFO` 级别改为 `DEBUG` 级别，减少日志噪音。

## 0.2.38 - 2026-05-29

### English

- Added Prompt Cache monitoring: DeepSeek's `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` (also `prompt_tokens_details.cached_tokens` for OpenAI-compatible) are now extracted, logged, and shown in the status bar tooltip with hit rate percentage.
- Status bar tooltip now shows per-request and session-level cache statistics.

### 中文

- 新增 Prompt Cache 监控：提取 DeepSeek 的 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`（也支持 OpenAI 兼容的 `prompt_tokens_details.cached_tokens`），输出日志并在状态栏 tooltip 展示命中率。
- 状态栏 tooltip 现在展示每次请求和会话级别的缓存统计。

## 0.2.37 - 2026-05-29

### English

- Added image description cache for the vision proxy. Previously, the same image was re-described on every Copilot turn because VS Code sends the full message history (including all prior images) on each request. Now a SHA-256–keyed LRU cache (max 100 entries) stores descriptions after the first call, so repeated images are served from cache.
- This eliminates redundant vision proxy calls and significantly reduces latency and token cost in multi-turn conversations with images.

### 中文

- 为视觉代理增加图片描述缓存。之前每轮 Copilot 对话都会重新描述所有历史图片（因为 VS Code 每轮都会发送完整消息历史），现在使用基于 SHA-256 的 LRU 缓存（上限 100 条），同一张图片只在首次遇到时调用视觉代理。
- 消除了重复的视觉代理请求，大幅降低包含图片的多轮对话的延迟和 token 开销。

## 0.2.36 - 2026-05-28

### English

- Revamped Marketplace Overview README with badges, feature cards, screenshots, quick-start guide, and structured configuration tables.
- Added `homepage`, `repository`, and `bugs` fields to `package.json` linking to GitHub.
- Added 4 screenshots (model picker, config panel, status bar, balance check).

### 中文

- 全面重写 Marketplace Overview README：徽章、特性卡片、截图、快速上手指南、结构化配置表格。
- `package.json` 新增 `homepage`、`repository`、`bugs` 字段，指向 GitHub 仓库。
- 新增 4 张截图（模型选择器、配置面板、状态栏、余额查询）。

## 0.2.35 - 2026-05-28

### English

- Auto balance refresh now prioritizes the provider used by the most recent model request.
- Usage stats remember the provider id for the last request, so GLM requests refresh GLM quota instead of being overwritten by DeepSeek balance.
- The status bar balance label now includes a short provider prefix such as `GLM:` or `DS:`.

### 中文

- 自动余额刷新现在优先刷新最近一次模型请求对应的 provider。
- 用量统计会记录最近请求的 provider id，因此 GLM 请求后会优先刷新 GLM 配额，不会马上被 DeepSeek 余额覆盖。
- 状态栏余额增加短 provider 前缀，例如 `GLM:` 或 `DS:`，避免看不出是哪家的值。

## 0.2.34 - 2026-05-28

### English

- Updated the Zhipu GLM quota parser for the actual `data.limits[]` response shape.
- The primary GLM display now prefers `TOKENS_LIMIT`, shows remaining percentage when exact remaining tokens are not returned, and includes reset time.
- The balance detail view lists every returned GLM limit entry, including `TOKENS_LIMIT` and `TIME_LIMIT`.

### 中文

- 按智谱 GLM 实际返回的 `data.limits[]` 结构更新配额解析。
- 主显示优先使用 `TOKENS_LIMIT`；接口没有返回精确剩余 tokens 时，显示剩余百分比，并展示重置时间。
- 余额详情里会列出所有 GLM limit 项，包括 `TOKENS_LIMIT` 和 `TIME_LIMIT`。

## 0.2.33 - 2026-05-28

### English

- Added Zhipu GLM / BigModel balance and quota checking.
- Providers whose id, name, or base URL contains `zhipu`, `glm`, or `bigmodel` are now recognized by **Check Balance** and auto-refresh.
- GLM quota requests use the root-relative endpoint `/api/monitor/usage/quota/limit`, so a chat base URL such as `https://open.bigmodel.cn/api/paas/v4` works correctly.
- The balance result displays remaining tokens, used tokens, quota limit, used percentage, and reset time when the API returns those fields.

### 中文

- 增加智谱 GLM / BigModel 的余额和配额查询支持。
- provider 的 id、name 或 base URL 包含 `zhipu`、`glm`、`bigmodel` 时，`Check Balance` 和自动刷新都会识别。
- GLM 配额查询会使用根路径接口 `/api/monitor/usage/quota/limit`，所以聊天 base URL 配成 `https://open.bigmodel.cn/api/paas/v4` 也能正确查询。
- 查询结果会尽量显示剩余 tokens、已用 tokens、额度上限、使用百分比和重置时间。

## 0.2.32 - 2026-05-27

### English

- Reduced routine log noise: provider model mapping, request start/finish, tool call reporting, and empty streaming retry logs are now `debug` level instead of `info`.
- Set `matrixOaiCopilot.logLevel` to `debug` to restore the detailed per-request logs.

### 中文

- 降低常规日志噪音：provider 模型映射、请求开始/结束、工具调用上报、空流重试等日志从 `info` 降为 `debug` 级别。
- 如需查看详细请求日志，将 `matrixOaiCopilot.logLevel` 设为 `debug`。

## 0.2.31 - 2026-05-27

### English

- Reduced routine log noise after the Ollama native debugging pass.
- `Ollama tool mode` now logs only the mode and tool count at info level; the full tool-name list is debug-only.
- Successful `Ollama response: 200`, auto balance refreshes, and converted tool-result previews are debug-only.
- Error responses and high-level provider request start/finish logs remain visible at info level.

### 中文

- 在 Ollama native 链路调通后降低常规日志噪音。
- `Ollama tool mode` 在 info 级别只输出模式和工具数量，完整工具名列表改为 debug 级别。
- 成功的 `Ollama response: 200`、自动余额刷新、tool-result preview 都改为 debug 级别。
- 错误响应以及 provider 请求开始/结束日志仍保留在 info 级别。

## 0.2.30 - 2026-05-27

### English

- Fixed Matrix OAI vision proxy requests for Ollama thinking models.
- Configured-image proxy requests now send `think: false` to Ollama native `/api/chat`, preventing Qwen from spending the whole small vision budget on `message.thinking` and returning empty `message.content`.
- Increased the default vision proxy output budget to 1200 tokens.
- Captures Ollama native `message.thinking` as reasoning text for non-streaming and streaming responses.

### 中文

- 修复 Ollama thinking 模型作为 Matrix OAI 视觉代理时容易返回空图片描述的问题。
- 配置模型做图片代理时，现在会向 Ollama native `/api/chat` 发送 `think: false`，避免 Qwen 把较小的视觉代理预算全部花在 `message.thinking` 里，导致 `message.content` 为空。
- 将默认视觉代理输出预算提高到 1200 tokens。
- 非流式和流式响应都会把 Ollama native 的 `message.thinking` 记录为 reasoning 文本。

## 0.2.29 - 2026-05-27

### English

- Strengthened the Ollama native-mode hint for directory listings.
- Tells Qwen to preserve every returned directory/file entry exactly, including hidden entries, Chinese names, and other non-ASCII paths.
- This addresses cases where `list_dir` returned `规划/` correctly but the model omitted it while summarizing the tool result.

### 中文

- 加强 Ollama native 模式下目录列表结果的提示。
- 明确要求 Qwen 原样保留工具返回的每一项，包括隐藏目录、中文名称和其他非 ASCII 路径。
- 修复 `list_dir` 已正确返回 `规划/`，但模型总结时漏掉中文目录的问题。

## 0.2.28 - 2026-05-27

### English

- Kept Ollama on the native `/api/chat` path and improved VS Code tool argument coercion.
- Resolves relative `path` / `filePath` arguments against the current workspace root before reporting tool calls back to VS Code.
- Adds a default `startLine: 1` for tools such as `read_file` when the exposed schema requires line-based reads.
- Preserves the original tool name for tool-result messages by remembering the previous `callId -> toolName` mapping.

### 中文

- 保持 Ollama 继续走 native `/api/chat`，只加强 VS Code 工具参数规整。
- 将相对 `path` / `filePath` 参数按当前 workspace 根目录转成绝对路径后再回报给 VS Code。
- 对 `read_file` 这类需要行号的工具，缺少 `startLine` 时默认补 `startLine: 1`。
- 通过记录上一轮 `callId -> toolName`，让 tool-result 消息保留真实工具名，不再轻易变成 `unknown`。

## 0.2.27 - 2026-05-27

### English

- Added the extension version to activation and provider-refresh logs so it is clear which installed build VS Code is running.
- Keeps the 0.2.26 Ollama/Qwen fix: native-mode tool-name guidance plus `file({"path": ...})` fallback normalization.

### 中文

- 在激活和刷新 Provider 的日志中输出扩展版本号，方便确认 VS Code 当前实际运行的是哪一个安装包。
- 继续包含 0.2.26 的 Ollama/Qwen 修复：native 模式工具名提示，以及 `file({"path": ...})` 的兜底归一化。

## 0.2.26 - 2026-05-27

### English

- Added an Ollama native-mode system hint that tells Qwen to use only the exact VS Code tool names supplied in the `tools` field.
- Normalized Qwen's generic `file({"path": ...})` tool call: directory paths now map to `list_dir`, while file-looking paths map to `read_file`.
- This prevents `Dropping unavailable tool call: file(...)` from causing an empty Copilot response when Qwen invents a generic file tool.

### 中文

- 在 Ollama native 模式下增加一条简短 system 提示，明确要求 Qwen 只能调用 `tools` 字段里真实存在的 VS Code 工具名。
- 归一化 Qwen 生成的泛化 `file({"path": ...})` 工具调用：目录路径映射到 `list_dir`，看起来像文件的路径映射到 `read_file`。
- 避免 `Dropping unavailable tool call: file(...)` 导致 Copilot 返回空响应。

## 0.2.25 - 2026-05-27

### English

- Fixed the provider start log for Ollama models so it shows the real native endpoint (`/api/chat`) instead of the OpenAI-compatible `/chat/completions` helper URL.
- Matched the reference provider's tool-result extraction more closely: non-text structured tool result parts are now JSON-stringified instead of being dropped.
- Added a compact tool-result conversion log with call id, tool name, character count, and preview.
- Preserved `toolName` / `name` on converted tool-result messages when VS Code provides it.

### 中文

- 修正 Ollama 模型的请求开始日志，现在显示真实 native endpoint（`/api/chat`），不再显示误导性的 OpenAI `/chat/completions` 辅助 URL。
- 对齐参考插件的 tool result 提取逻辑：非文本结构化工具结果现在会 `JSON.stringify` 后传给模型，不再被丢弃。
- 新增简短 tool result 转换日志，包含 call id、工具名、字符数和预览。
- VS Code 如果提供了 `toolName` / `name`，转换 tool-result 消息时会保留下来。

## 0.2.24 - 2026-05-27

### English

- Converts plain-text tool invocations from Qwen/Ollama into VS Code tool calls.
- Handles bare tool-name outputs such as `list_files`, plus simple invocation text such as `read_file "path"` and `read_file(path="path")`.
- These parsed calls still pass through the current-request alias normalizer, so `list_files` becomes the real `list_dir` tool when that is what VS Code exposed.

### 中文

- 将 Qwen/Ollama 输出的纯文本工具调用转换成 VS Code tool call。
- 支持 `list_files` 这类单独工具名，以及 `read_file "path"`、`read_file(path="path")` 这类简单调用文本。
- 解析出的调用仍会走当前请求工具别名归一化，所以 `list_files` 会继续映射到 VS Code 实际暴露的 `list_dir`。

## 0.2.23 - 2026-05-27

### English

- Normalize model-emitted tool aliases against the actual VS Code tools available in the current request.
- Maps common Qwen/Copilot aliases such as `list_files`, `list_directory`, and `file(action=list)` to the real `list_dir` tool when that is the tool exposed by VS Code.
- Drops unknown unavailable tool calls instead of reporting invalid tool names back to VS Code.
- Adds logs for alias normalization, for example `Normalized tool call: list_files -> list_dir`.

### 中文

- 按当前请求里 VS Code 实际提供的工具列表归一化模型输出的工具别名。
- 将 Qwen/Copilot 常见别名 `list_files`、`list_directory`、`file(action=list)` 映射到真实存在的 `list_dir` 工具。
- 未知且当前不存在的工具调用不再回报给 VS Code，避免继续触发“工具不存在”。
- 新增别名归一化日志，例如 `Normalized tool call: list_files -> list_dir`。

## 0.2.22 - 2026-05-27

### English

- Matched the installed `OAI Compatible Provider for Copilot` Ollama flow more closely: Ollama tool requests now keep streaming enabled by default.
- Fixed Ollama streaming tool-call handling by collecting `message.tool_calls` from every NDJSON chunk, not only the final `done` chunk.
- Stopped simplifying Ollama tool schemas by default; VS Code tool schemas are forwarded in the same OpenAI-style function shape used by the reference provider.
- Added info logs for forwarded Ollama tool names and for each `LanguageModelToolCallPart` reported back to VS Code.

### 中文

- 按本机已安装的 `OAI Compatible Provider for Copilot` 实现对齐 Ollama 流程：Ollama 工具请求默认保持 streaming。
- 修复 Ollama streaming 工具调用收集逻辑：现在每个 NDJSON chunk 里的 `message.tool_calls` 都会收集，不再只看最终 `done` chunk。
- 默认不再简化 Ollama tool schema；按参考插件一样，把 VS Code 工具 schema 以 OpenAI function tools 形态直接转发。
- 新增 info 日志，记录转发给 Ollama 的工具名，以及每次回报给 VS Code 的 `LanguageModelToolCallPart`。

## 0.2.21 - 2026-05-27

### English

- Restored Ollama/Qwen tool calls to Ollama's official native `/api/chat` `tools` path by default.
- Changed the default Ollama provider URL to `http://localhost:11434`; `/v1` is still tolerated and stripped internally for native Ollama requests.
- Kept `prompt` tool mode only as an explicit manual fallback through `matrixOaiCopilot.ollamaToolMode`.
- Added `vision` as a compatibility alias for `supportsImages` in model configuration.

### 中文

- Ollama/Qwen 工具调用默认改回 Ollama 官方 native `/api/chat` + `tools` 路径。
- 默认 Ollama provider 地址改成 `http://localhost:11434`；如果用户配置了 `/v1`，native Ollama 请求里仍会自动剥掉。
- `prompt` 工具模式只保留为 `matrixOaiCopilot.ollamaToolMode` 的手动兜底选项。
- 模型配置新增兼容字段 `vision`，等价于 `supportsImages`。

## 0.2.20 - 2026-05-27

### English

- Reworked Ollama/Qwen tool calling against Qwen's tool-call format and Ollama's `/api/chat` message rules.
- Qwen-family Ollama models now default to prompt-mode tools instead of Ollama native parser tools, avoiding `Value looks like object, but can't find closing '}' symbol` renderer/parser failures.
- Converted Copilot/OpenAI tool history into Qwen/Ollama-compatible history: assistant tool calls are replayed as JSON tool-call objects, and tool results are replayed as named text blocks in prompt mode.
- Improved fallback parsing for `<tool_call>{...}</tool_call>`, fenced JSON, balanced JSON objects, and command-only outputs such as `ls`/`dir`.
- Added `matrixOaiCopilot.ollamaToolMode` (`auto`, `prompt`, `native`) plus a per-model override for troubleshooting.

### 中文

- 按 Qwen 工具调用格式和 Ollama `/api/chat` 消息规则重做 Ollama/Qwen 工具调用链路。
- Qwen 系列 Ollama 模型默认走 prompt-mode 工具调用，不再默认依赖 Ollama 原生 parser，避免 `Value looks like object, but can't find closing '}' symbol` 这类解析失败。
- Copilot/OpenAI 的工具历史现在会转换成 Qwen/Ollama 能理解的历史：assistant 工具调用回放为 JSON 工具调用对象，工具结果回放为带名字的文本块。
- 增强 `<tool_call>{...}</tool_call>`、代码块 JSON、平衡 JSON 对象，以及只输出 `ls`/`dir` 这类命令时的兜底解析。
- 新增 `matrixOaiCopilot.ollamaToolMode`（`auto`、`prompt`、`native`）和单模型覆盖项，方便排查。

## 0.2.19 - 2026-05-27

### English

- Hardened Ollama native tool calls for Qwen renderer compatibility: tool descriptions and enum strings now strip `{}` characters, nested parameter objects are flattened to strings, and assistant history tool-call arguments are converted back to objects.
- Writes a sanitized `ollama-last-failed-request.json` dump on Ollama 4xx/5xx responses so request-shape issues can be diagnosed from the exact payload.

### 中文

- 加固 Ollama 原生工具调用对 Qwen renderer 的兼容：工具描述和 enum 字符串会移除 `{}`，嵌套参数对象会降级成字符串，历史 assistant tool-call 的 arguments 会转回对象。
- Ollama 返回 4xx/5xx 时会写出脱敏后的 `ollama-last-failed-request.json`，方便直接查看实际请求体定位问题。

## 0.2.18 - 2026-05-26

### English

- Simplified Copilot tool JSON schemas before sending them to Ollama native `/api/chat`.
- This avoids Qwen/Ollama template failures when Copilot supplies complex schemas with nested objects, unions, defaults, or unsupported metadata.

### 中文

- 在发送到 Ollama 原生 `/api/chat` 前，先简化 Copilot 工具的 JSON Schema。
- 避免 Copilot 提供复杂 schema（嵌套对象、union、默认值、额外元数据等）时触发 Qwen/Ollama 模板解析失败。

## 0.2.17 - 2026-05-26

### English

- Fixed Ollama native `/api/chat` requests for image-capable models by converting OpenAI-style multimodal content arrays into Ollama's `{ content: string, images: [...] }` message format.
- This avoids Ollama template errors such as `Value looks like object, but can't find closing '}' symbol` when Copilot sends image parts.

### 中文

- 修复 Ollama 原生 `/api/chat` 的多模态请求格式：把 OpenAI 风格的 content 数组转换成 Ollama 需要的 `{ content: string, images: [...] }` 消息格式。
- 避免 Copilot 传入图片片段时触发 Ollama 模板错误，例如 `Value looks like object, but can't find closing '}' symbol`。

## 0.2.16 - 2026-05-26

### English

- Added Ollama native API (`/api/chat`) support. Models with `apiMode: "ollama"` now route requests through Ollama's native API instead of the OpenAI-compatible endpoint, enabling tool/function calling for Ollama models (e.g. Qwen3.5 9B).

### 中文

- 新增 Ollama 原生 API（`/api/chat`）支持。配置了 `apiMode: "ollama"` 的模型现在会走 Ollama 原生接口而不是 OpenAI 兼容接口，使 Ollama 模型（如 Qwen3.5 9B）的工具调用正常可用。

## 0.2.15 - 2026-05-26

### English

- Kept provider-declared image-capable models selectable for the vision proxy; image requests now rely on the short proxy timeout instead of hard-coded model exclusions.
- Added `matrixOaiCopilot.copilot.visionProxyTimeoutSeconds` so image-description requests fail quickly instead of making Copilot appear stuck.
- Vision proxy failures now return a clear text fallback to the main text model and write an error to the Matrix OAI Gateway output channel.
- Added request model-mapping logs to show the Copilot model id and the Matrix OAI model selected for each provider request.

### 中文

- 保留 provider 声明支持图片的模型作为视觉代理候选；图片请求现在靠独立短超时防卡死，不再硬编码排除具体模型。
- 新增 `matrixOaiCopilot.copilot.visionProxyTimeoutSeconds`，图片描述请求会单独短超时，避免 Copilot 看起来一直卡死。
- 视觉代理失败时会把明确的失败说明作为文本回退给主模型，并在 Matrix OAI Gateway 输出里记录错误。
- 新增请求模型映射日志，每次 provider 调用都会显示 Copilot 传入的模型 id 和最终匹配到的 Matrix OAI 模型。

## 0.2.14 - 2026-05-26

### English

- Centralized image-capability detection for Matrix OAI and VS Code models.
- Vision support now recognizes `supportsImages`, `supportsImageInput`, `supportsVision`, `capabilities.imageInput`, `supports_image_detail_original`, and `input_modalities` / `inputModalities` / `modalities` containing `image`.

### 中文

- 统一 Matrix OAI 和 VS Code 模型的视觉能力判断逻辑。
- 视觉支持现在会识别 `supportsImages`、`supportsImageInput`、`supportsVision`、`capabilities.imageInput`、`supports_image_detail_original`，以及包含 `image` 的 `input_modalities` / `inputModalities` / `modalities`。

## 0.2.13 - 2026-05-26

### English

- Vision proxy selection now includes Matrix OAI configured provider models with `supportsImages: true`.
- `Auto` vision proxy now prefers Matrix OAI image-capable models before falling back to VS Code/Copilot image-capable models.
- Vision proxy setting values can use `matrix:<model-id>` for Matrix OAI provider models or `vscode:<model-id>` for VS Code language models.

### 中文

- 视觉代理候选现在会包含 Matrix OAI 配置里标记了 `supportsImages: true` 的 provider 模型。
- `Auto` 视觉代理会优先使用 Matrix OAI 自己配置的视觉模型，找不到再退到 VS Code/Copilot 的视觉模型。
- 视觉代理配置值支持 `matrix:<模型ID>` 指向 Matrix OAI provider 模型，也支持 `vscode:<模型ID>` 指向 VS Code 语言模型。

## 0.2.12 - 2026-05-26

### English

- Added Copilot model-picker configuration schema for Matrix OAI thinking effort, so supported models can expose None / High / Max from the model row settings.
- Added `Matrix OAI Gateway: Set Vision Proxy Model` and a configuration-panel button for selecting the VS Code model used to describe image inputs for text-only Matrix OAI models.
- The configuration panel now shows the current Copilot thinking mode and vision proxy model.

### 中文

- 按 GitHub Copilot 模型选择器的方式补上模型行配置：支持的 Matrix OAI 模型可以在模型设置里选择 None / High / Max 思考深度。
- 新增 `Matrix OAI Gateway: Set Vision Proxy Model` 命令和配置页按钮，用来选择纯文本 Matrix OAI 模型处理截图时使用的视觉代理模型。
- 配置页现在会显示当前 Copilot 思考模式和视觉代理模型。

## 0.2.11 - 2026-05-26

### English

- Added `Matrix OAI Gateway: Write Codex Config` to generate Codex CLI configuration for the local Matrix OAI Responses proxy.
- Writes `~/.codex/config.toml` with `model_provider = "matrix-oai"` and `wire_api = "responses"`, preserving unrelated settings and backing up the old config first.
- Writes or merges `~/.codex/models_catalog.json` entries for configured Matrix OAI models so Codex can list DeepSeek and other routed models.
- Added Copilot-facing thinking-effort selection and a vision proxy path that describes image inputs before sending them to text-only routed models.

### 中文

- 新增 `Matrix OAI Gateway: Write Codex Config` 命令，可以自动生成 Codex CLI 使用 Matrix OAI 本地 Responses 代理所需的配置。
- 写入 `~/.codex/config.toml` 时会设置 `model_provider = "matrix-oai"` 和 `wire_api = "responses"`，保留其他无关配置，并先备份旧配置。
- 写入或合并 `~/.codex/models_catalog.json`，让 Codex 能列出通过 Matrix OAI 路由的 DeepSeek 和其他模型。
- 补齐 GitHub Copilot 接入体验：新增 Copilot 思考深度选择，并为纯文本模型增加图片转文字代理。

## 0.2.10 - 2026-05-26

### English

- Hardened tool-result and Responses API content conversion so only explicit text fields are forwarded to upstream models.
- Removed the remaining `JSON.stringify` fallback paths that could leak VS Code internal metadata such as `cache_control` data parts into prompts.

### 中文

- 加固工具结果和 Responses API 内容转换逻辑：只把明确的文本字段转发给上游模型。
- 移除剩余可能把 VS Code 内部 `cache_control` 等元数据 stringify 进 prompt 的兜底路径。

## 0.2.9 - 2026-05-26

### English

- Retry provider requests once without streaming when the upstream stream completes with no text and no tool calls.
- Report a clear empty-assistant-response error instead of letting VS Code show only "Sorry, no response was returned."
- Log provider response shape at info level (`text`, `tool_calls`, `reasoning`) to make intermittent empty responses easier to diagnose.

### 中文

- 当上游流式响应结束后没有正文也没有工具调用时，自动改用非流式请求重试一次。
- 如果重试后仍为空，抛出明确的空 assistant 响应错误，避免 VS Code 只显示 “Sorry, no response was returned.”
- 在 info 日志记录响应形态（`text`、`tool_calls`、`reasoning`），方便排查偶发空响应。

## 0.2.8 - 2026-05-26

### English

- Fixed additional content-to-text conversion paths that could leak non-text data into conversation context.
- `openAiContentToText`: filter `reasoning_content`/`reasoning` types and return empty string for unknown content types instead of `JSON.stringify`-ing them.
- `anthropicContentToText`: filter `tool_use`/`tool_result` types and return empty string for unknown content types instead of `JSON.stringify`-ing them.
- `responsesToChatCompletions`: tool_result sub-items without `.text` no longer fall back to `JSON.stringify`.

### 中文

- 修复额外三处 content-to-text 转换路径中非文本数据泄漏到对话上下文的问题。
- `openAiContentToText`：过滤 `reasoning_content`/`reasoning` 类型，对未知内容类型返回空字符串而非 `JSON.stringify`。
- `anthropicContentToText`：过滤 `tool_use`/`tool_result` 类型，对未知内容类型返回空字符串而非 `JSON.stringify`。
- `responsesToChatCompletions`：tool_result 的子项若无 `.text` 不再回退到 `JSON.stringify`。

## 0.2.7 - 2026-05-25

### English

- Fixed tool-result conversion leaking VS Code internal non-text data parts into upstream prompts.
- Filtered `cache_control` and other non-image data parts before serializing tool results, preventing payloads such as `{"$mid":24,"mimeType":"cache_control","data":"ZXBoZW1lcmFs"}` from being sent to DeepSeek as visible text.
- This avoids false "dirty data" diagnoses when files only contain normal UTF-8 text, including Chinese comments or descriptions.

### 中文

- 修复工具结果转换时把 VS Code 内部非文本 DataPart 泄漏进上游 prompt 的问题。
- 在序列化工具结果前过滤 `cache_control` 和其他非图片 DataPart，避免 `{"$mid":24,"mimeType":"cache_control","data":"ZXBoZW1lcmFs"}` 这类内部元数据被当作正文发给 DeepSeek。
- 避免模型把正常 UTF-8 文件，特别是带中文注释或描述的文件，误判成有“脏数据”。

## 0.2.5 - 2026-05-23

### English

- **OpenAI Responses API proxy**: Added `/v1/responses` endpoint to the local proxy. Translates OpenAI Responses protocol (`response.created`, `response.output_text.delta`, `response.completed` events) to standard Chat Completions (`/v1/chat/completions`) and back. This enables OpenAI Codex CLI (Responses API) to work with any OAI-compatible provider configured in Matrix OAI Gateway.
- Both streaming (real-time SSE event translation) and non-streaming modes supported.
- Tool call responses are translated between the two protocols automatically.

### 中文

- **OpenAI Responses API 代理**：本地代理新增 `/v1/responses` 接口，自动将 OpenAI Responses 协议翻译成标准 Chat Completions，并将结果翻译回 Responses 格式。这使得使用 Responses API 的 OpenAI Codex CLI 可以直接使用 Matrix OAI Gateway 中配置的任何 OAI 兼容模型。
- 支持流式（SSE 事件实时翻译）和非流式两种模式。
- 工具调用响应在两个协议之间自动翻译。

## 0.2.1 - 0.2.4 - 2026-05-22

### English

- **0.2.4**: Auto-refresh balance on startup (30s delay) and every 5 minutes (configurable via `matrixOaiCopilot.balanceRefreshMinutes`). Status bar shows balance after first successful query.
- **0.2.3**: Balance now displayed in the VS Code status bar after querying.
- **0.2.2**: Balance check reuses stored API keys (provider-scoped first, then global). No more repetitive key entry.
- **0.2.1**: Fixed `SyntaxError: Unexpected token '}'` caused by missing `function showConfigPanel()` header. Restored status bar and output log functionality.

### 中文

- **0.2.4**: 启动 30 秒后自动查询余额，之后每 5 分钟自动刷新（可在设置 `matrixOaiCopilot.balanceRefreshMinutes` 调整）。查到的余额直接显示在状态栏。
- **0.2.3**: 查询余额后，结果直接显示在 VS Code 右下角状态栏上。
- **0.2.2**: 余额查询自动使用已保存的 API Key（先查 provider 专属 key，再查全局 key），不再反复要求输入。
- **0.2.1**: 修复 `SyntaxError: Unexpected token '}'`（`showConfigPanel()` 缺少 `function` 声明头导致）。状态栏和输出日志恢复。

## 0.1.9 - 2026-05-20

### English

- Added VS Code configuration defaults for Copilot Explore subagents:
  - `chat.exploreAgent.defaultModel`: `DeepSeek V4 Pro (matrix-oai-compatible)`
  - `chat.customAgentInSubagent.enabled`: `true`
- Documented how to keep Copilot Agent Explore tasks on the OAI provider model instead of falling back to built-in Copilot models.

### 中文

- 新增 VS Code 默认配置，让 Copilot Explore 子代理默认使用 DeepSeek V4 Pro：
  - `chat.exploreAgent.defaultModel`: `DeepSeek V4 Pro (matrix-oai-compatible)`
  - `chat.customAgentInSubagent.enabled`: `true`
- 补充文档，说明如何避免 Agent/Explore 子任务自动切回 Copilot 内置模型。

## 0.1.8 - 2026-05-20

### English

- Aligned DeepSeek V4 defaults with the official API limits: 1M context and 384K advertised maximum output.
- Added model-level `stream_options` passthrough and enabled `include_usage` for DeepSeek streaming requests.
- Set DeepSeek V4 Pro to official maximum reasoning effort with `reasoning_effort: "max"`.
- Removed non-official DeepSeek request flags from the workspace configuration.

### 中文

- 按 DeepSeek 官方参数更新 V4 默认配置：1M 上下文、384K 最大输出能力声明。
- 新增模型级 `stream_options` 透传，并为 DeepSeek 流式请求开启 `include_usage`。
- DeepSeek V4 Pro 使用官方最高推理强度 `reasoning_effort: "max"`。
- 清理工作区配置里的非官方 DeepSeek 请求字段。

## 0.1.7 - 2026-05-20

### English

- Stabilized model IDs shown to VS Code/Copilot by exposing simple IDs such as `deepseek-v4-pro` instead of dotted provider-qualified IDs.
- Kept backwards-compatible matching for legacy IDs such as `deepseek.deepseek-v4-pro`.
- Reduced Copilot local model-cache misses that could cause the selected OAI model to fall back to another model.

### 中文

- 暴露给 VS Code/Copilot 的模型 ID 改为更稳定的简单形式，例如 `deepseek-v4-pro`，不再默认使用带点的 provider 前缀。
- 继续兼容旧 ID，例如 `deepseek.deepseek-v4-pro`。
- 降低 Copilot 本地模型缓存找不到自定义模型，从而自动切回其他模型的概率。

## 0.1.6 - 2026-05-20

### English

- Fixed intermittent Copilot `LanguageModelError: matrix-oai-compatible/...` failures during tool-calling loops.
- Kept the VS Code language model provider registered for the lifetime of the extension instead of disposing and re-registering it on configuration refresh.
- Accepted both provider-local model IDs and VS Code fully qualified IDs such as `matrix-oai-compatible/deepseek.deepseek-v4-pro`.

### 中文

- 修复工具调用循环中偶发的 `LanguageModelError: matrix-oai-compatible/...` 空红叉问题。
- 配置刷新时不再 dispose/re-register language model provider，避免 Copilot 中途拿到失效模型句柄。
- 同时兼容 provider 内部模型 ID 和 VS Code 完整模型 ID，例如 `matrix-oai-compatible/deepseek.deepseek-v4-pro`。

## 0.1.5 - 2026-05-20

### English

- Fixed slow upstream requests surfacing as raw `AbortError` stack traces.
- Added clearer timeout errors with the configured timeout value.
- Added per-model `requestTimeoutSeconds` and `stream` settings.
- Increased the default upstream timeout to 300 seconds for slow reasoning models.
- Applied model-level `stream: false` overrides before sending upstream requests.

### 中文

- 修复慢请求超时只显示原始 `AbortError` 堆栈的问题。
- 超时报错现在会显示具体超时时间和处理建议。
- 新增模型级 `requestTimeoutSeconds` 和 `stream` 配置。
- 默认上游超时时间提升到 300 秒，适配慢思考模型。
- 模型里的 `stream: false` 现在会真正生效。

## 0.1.4 - 2026-05-20

### English

- Fixed DeepSeek-compatible thinking-mode tool-call failures by caching upstream `reasoning_content` and replaying it on matching assistant history.
- Added a safe fallback that sends empty `reasoning_content` on assistant tool-call turns when VS Code does not expose the original hidden reasoning text.
- Improved upstream error formatting and secret redaction.
- Added status bar telemetry: proxy port, latest context usage, total requests, and total errors.
- Expanded the configuration page with last request context, model context/output limits, reasoning replay state, formatted token totals, and redacted provider headers.
- Persisted error counts alongside usage statistics.
- Added bilingual README content and marketplace description details.

### 中文

- 修复 DeepSeek 兼容思考模式下工具调用多轮对话可能报 `reasoning_content` 缺失的问题。
- 在 VS Code 不返回隐藏思考内容时，对 assistant 工具调用历史补空 `reasoning_content` 兜底。
- 优化上游错误展示，并对密钥类内容做脱敏。
- 底部状态栏新增代理端口、最近上下文用量、请求数、错误数。
- 配置页新增最近请求上下文、模型上下文/输出上限、思考回放状态、格式化 token 用量和 header 脱敏。
- 错误统计现在会和用量一起持久化。
- 补充中英文 README 和扩展描述。

## 0.1.3 - 2026-05-20

- Added model default parameter passthrough for sampling and thinking options.
- Added built-in Ollama Qwen and DeepSeek model defaults.
- Restored packaged icon and fixed marketplace manifest packaging.

## 0.1.0 - 2026-05-20

- Initial Matrix OAI Gateway provider and proxy implementation.

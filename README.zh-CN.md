# ACSL Toolkit

[English](README.md)

ACSL Toolkit 是一个轻量级的 ANSI/ISO C Specification Language（ACSL）编辑辅助扩展。它在现有 C/C++ 文档中提供语法高亮、原生行注释支持、仅限 annotation 的词法补全和实用模板，不要求安装 Frama-C、OCaml、语言服务器或原生可执行程序。

扩展只增强已有的 `c` 和 `cpp` language mode，不会接管 C/C++ 文件，也不会替代 C/C++ 语言扩展。

```c
/*@
  requires length > 0;
  requires \valid(buffer + (0 .. length - 1));
  ensures \result >= 0;
*/
int inspect(const int *buffer, int length);

//@ assert index < length;
```

> ACSL Toolkit 当前处于 Preview 阶段。它提供的是词法编辑辅助，不负责解析或验证规约，也不保证某个特定 Frama-C 版本实现目录中的每一个条目。

## 功能

- 在 C/C++ 文档中高亮 `/*@ ... */` 和 `//@ ...` annotation。
- 只有当光标位于 ACSL annotation 内部时才返回 ACSL 补全。
- 从版本化的 ACSL 1.24 词汇目录中补全 clause、keyword、logic type、多词结构和常用 backslash construct。
- 对 `\va`、`loop inv` 等前缀执行完整替换，避免重复反斜杠或只替换部分短语。
- 为 `requires`、`ensures`、`loop invariant` 等 clause 插入可用 Tab 跳转的模板，但不会猜测 predicate 内容。
- 为 `axiomatic`、`predicate`、`logic`、`lemma`、`axiom`、`behavior` 和 `inductive` 等声明提供结构化模板。
- 块 annotation 使用多行声明模板；在 `//@` 中自动使用不会逸出当前行的单行形式。
- 支持在块 annotation 内使用 VS Code 原生的 **切换行注释** 操作注释规约条款。
- 不修改文档已有的 `c` 或 `cpp` language ID，使其他 C/C++ 高亮、补全、导航和格式化 provider 可以继续工作。

## 安装

### Visual Studio Marketplace

在 VS Code 的扩展视图中搜索 **ACSL Toolkit**，然后选择 **Install**。

### 安装 VSIX

从项目的 GitHub Releases 页面下载 `.vsix`，在命令面板中运行
**Extensions: Install from VSIX...**，然后选择下载的文件。

也可以使用命令行：

```sh
code --install-extension acsl-toolkit-<version>.vsix
```

ACSL Toolkit 要求 VS Code 1.85.0 或更高版本。扩展运行时不依赖 Node.js、
Frama-C、OCaml 或 Microsoft C/C++ 扩展。

## 使用

打开 language mode 为 **C** 或 **C++** 的文档并编写 ACSL annotation。常见补全示例：

| 输入前缀 | 示例结果 |
|---|---|
| `req` | `requires` |
| `ens` | `ensures` |
| `\va` | `\valid`、`\valid_read` |
| `\res` | `\result` |
| `\fo` | `\forall` |
| `loop inv` | `loop invariant` |

输入 `\` 会显式触发 ACSL 补全。普通字母候选是否自动弹出仍遵循用户的建议设置；需要时可以执行 **Trigger Suggest** 主动打开候选列表。

扩展不会在普通代码、字符串和普通注释中返回 ACSL 候选：

```c
// ordinary comment
/* ordinary comment */
const char *text = "/*@ not an annotation */";
int requires = 1;
```

### 注释 ACSL 规约条款

在 `/*@ ... */` annotation 内，将光标放在规约条款所在行，或者选中多行
规约条款，然后执行 VS Code 内置的 **切换行注释**（Windows/Linux 默认为
`Ctrl+/`，macOS 默认为 `Cmd+/`）。VS Code 会插入 `//`，并保留外层 ACSL
annotation：

```c
/*@
  // requires old_condition;
  ensures new_condition;
*/
```

被注释的规约条款使用普通 comment scope，由当前主题按普通注释着色，并且不再
提供 ACSL 补全。再次执行 **切换行注释** 即可恢复。ACSL Toolkit 在 annotation
内部只提供 `//` 行注释；由于 C/C++ 的块注释不能嵌套，因此不支持在
`/*@ ... */` 内插入嵌套的 `/* ... */` 注释。

## 模板

带模板的词汇只显示一个候选，不会同时出现重复的 keyword 和 snippet。接受 `requires` 后会插入 predicate 占位符：

```acsl
requires ${1:predicate};
```

块声明会生成相应的换行和花括号：

```acsl
axiomatic ${1:name} {
  ${2:declarations}
}
```

扩展只提供可编辑占位符，不推断 predicate、类型、变量、函数契约或程序语义。

## 兼容性与当前范围

- Completion provider 注册到 VS Code 的 `c` 和 `cpp` language ID；头文件在被 VS Code 识别为其中一种语言时也可使用。
- C++ 文档使用与 C 文档相同的 ACSL 1.24 共享词汇，这不代表完整支持 ACSL++。
- 当前目录覆盖编辑功能所需的核心 clause、声明、logic type、多词结构和 built-in，但尚不宣称穷尽 ACSL 1.24 的所有产生式。已知词法缺口包括 module/import 结构、`\as` 和特殊模式通配符补全。
- TextMate scope 的最终颜色由当前主题决定；扩展不会覆盖主题颜色。
- VS Code 可能合并多个 completion provider 的结果，本扩展只能控制自己的候选。
- 如果其他扩展或用户设置把 C/C++ 文件重新映射到其他 language ID，本扩展可能不会为该文档激活。

项目使用同一份平台无关的 Web Extension bundle，面向桌面 VS Code、
Remote/Codespaces 和浏览器版 VS Code。详细边界见
[兼容性说明](docs/compatibility.md)。

## 不包含的功能

ACSL Toolkit 不提供 ACSL parser、AST、语义类型推导、diagnostics、proof obligation、WP、Frama-C 执行、代码导航或自动契约生成，也不实现 C/C++ IntelliSense。

## 隐私与工作区安全

扩展不收集遥测、不发起网络请求、不启动外部进程，也不会自行枚举或打开其他工作区文件。补全只在本地内存中处理 VS Code 提供的当前文档文本。规约条款注释由 VS Code 内置编辑操作完成，并支持正常撤销。扩展支持不受信任工作区和虚拟工作区，不请求额外的工作区信任。

## 支持与开发

故障排查和负责任的问题报告方式见 [SUPPORT.md](SUPPORT.md)。开发和贡献说明单独保存在 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

项目原创实现代码使用 MIT License。版本化 ACSL 词汇依据采用 CC BY 4.0 的 ACSL 1.24 官方规范独立筛选和重组；归因、来源与修改说明见[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

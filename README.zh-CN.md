# ACSL Toolkit

[English](README.md)

ACSL Toolkit 是一个轻量级的 ANSI/ISO C Specification Language（ACSL）编辑辅助扩展。它在现有 C/C++ 文档中提供语法高亮、原生行注释支持、仅限 annotation 的词法补全、已声明名称补全和实用模板，不要求安装 Frama-C、OCaml、语言服务器或原生可执行程序。

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
- 为内置 ACSL 1.24 词汇目录中的全部 48 个可调用条目插入参数占位符。
- 补全 `predicate`、`logic` 定义中声明的输入参数，以及 `\let`、`\forall`、`\exists`、`\lambda` 引入且仍在当前词法作用域内的局部变量，同时支持元组绑定和集合推导式中的变量。
- 补全当前 annotation 或此前 annotation 中声明的自定义 `predicate`、`logic` 名称，并根据声明参数提供可编辑的调用占位符。
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

### 补全已声明的参数与局部变量

当前 annotation 中已声明、且在光标位置仍然可见的名称，会和 ACSL 词汇一起出现在候选列表中。例如：

```c
/*@
  predicate positive(integer value) = value > 0;
  logic integer doubled(integer value) = value * 2;
  predicate nonnegative_elements(integer *values, integer length) =
    \forall integer index; 0 <= index < length ==> values[index] >= 0;
*/
```

编写前两个定义的主体时，输入 `v` 即可得到对应的 `value` 参数候选；在量化表达式内部，输入 `i` 可得到 `index`。`\let`、`\exists`、`\lambda` 绑定的局部变量也支持这种补全。局部候选使用变量图标，并带有 ACSL 说明。内层同名变量会遮蔽外层名称；离开定义或绑定表达式的作用域后，这些局部名称不再显示。

`inductive` 的 `case` 内同样支持自行声明的局部绑定。`inductive` 头部写出的参数名称不进入 `case` 作用域；应在各个 `case` 内通过量词或 `\let` 引入需要使用的变量。

局部变量补全从当前 annotation 中显式声明的绑定提取候选，不查询 C/C++ 参数，也不推导类型或校验表达式。反斜杠前缀仍用于 ACSL 构造，不返回普通局部变量。候选是否自动弹出遵循用户的建议设置，也可以执行 **Trigger Suggest** 主动触发。

### 引用自定义 logic 与 predicate

当前 annotation 或此前 annotation 中声明完整的名称，可以在当前文档的其他规约中补全。例如：

```c
/*@
  predicate positive(integer value) = value > 0;
  logic integer doubled(integer value) = value * 2;
*/

/*@
  requires positive(input);
  ensures doubled(input) > input;
*/
int inspect_positive(int input);
```

在函数契约中输入 `po`，即可得到 `positive`，接受后插入 `positive(${1:value})`；输入 `dou` 则提供 `doubled(${1:value})`。占位符名称来自声明参数，扩展不会猜测调用位置应传入什么值。声明的逻辑标签也会生成可编辑占位符，不会自动选择具体标签。若名称后已经有括号和参数，补全只替换名称，保留现有调用。没有参数列表的声明插入名称，以及声明中存在的标签占位符；显式空参数列表则插入 `name()`。通过 `inductive` 定义的谓词同样支持引用补全。

重载声明分别展示签名，不按类型自动选择重载。当前可见的同名局部变量优先显示。定义头部完整后，也可以在其自身主体内补全该名称；同一 annotation 中稍后完成的声明也会提供候选，方便编写相互递归的定义。扩展不查询后续 annotation、其他文档或 `#include` 文件；被注释的声明，以及普通 C/C++ 注释或字符串中的伪 annotation 均会忽略。

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

内置 ACSL 1.24 词汇目录中的全部 48 个可调用条目都提供参数占位符；其中既有逻辑函数，也包括 `\old`、`\at` 等特殊可调用构造。例如，接受 `\max` 后会插入：

```acsl
\max(${1:x}, ${2:y})
```

其他示例包括 `\at(expression, label)`、`\sum(lower, upper, function)`、`\base_addr(pointer)`、`\nth(sequence, index)`、`\atan2(y, x)` 和 `real_of_float(value)`。对于 `\union` 等可变参数函数，模板使用一个列表占位符；对于可选逻辑标签，扩展不会猜测具体标签。默认模板采用 `\max` 和 `\min` 的常用二参数形式；如需 ACSL 的三参数有界高阶形式，可以继续编辑插入后的调用。如果补全前缀后已经存在参数列表，扩展只补全内置函数名称，不会重复插入括号或覆盖现有参数；已有的 `{label}` 或 `<type>` 参数也会保留。

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

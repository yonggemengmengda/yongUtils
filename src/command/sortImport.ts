import * as vscode from "vscode"
// 导入分组定义
enum ImportGroup {
  PUBLIC_COMPONENT = 'public-component',    // 公共组件（第三方库的.vue文件）
  LOCAL_COMPONENT = 'local-component',      // 本地组件（项目内的.vue文件）
  PUBLIC_UTILITY = 'public-utility',        // 公共工具函数
  LOCAL_UTILITY = 'local-utility',          // 本地工具函数
  PUBLIC_LIBRARY = 'public-library',        // 公共库
  LOCAL_LIBRARY = 'local-library'          // 本地库
}

// Import语句接口
interface ImportStatement {
  originalLines: string[];        // 原始行（包含空行、注释）
  fullText: string;               // 合并后的完整import语句
  modulePath: string;             // 模块路径
  group: ImportGroup;             // 分组
  hasBraces: boolean;             // 是否包含{}
  isDefault: boolean;             // 是否是默认导入
  isRelative: boolean;            // 是否是相对路径
  specifiers: string;             // 导入的具体内容
  specifierCount: number;         // {} 内导入项数量
  specifiersList: string[];       // 解析后的导入项列表
  startLine: number;              // 起始行号（在原文件中的位置）
  endLine: number;                // 结束行号
  isVueFile: boolean;             // 是否是.vue文件
  isInternalLibrary: boolean;     // 是否是内部库
  isExternalLibrary: boolean;     // 是否是外部库
}

// 排序选项接口
interface SortOptions {
  addGroupComments: boolean;
  sortByLength: boolean;
  groupNames?: Record<ImportGroup, string>;
  internalLibPrefixes: string[];
}


/**
 * 排序文档中的import语句
 */
function sortImportsInDocument(
  text: string, 
  options: SortOptions
): { modified: boolean; sortedImports: string; startOffset: number; endOffset: number } {
  
  const blocks = findImportBlocksWithOffsets(text);
  
  if (blocks.length === 0) {
    return { modified: false, sortedImports: '', startOffset: 0, endOffset: 0 };
  }

  // 处理第一个连续的import块
  const firstBlock = blocks[0];
  const importStatements = parseImportBlock(firstBlock.content, firstBlock.startLine, options);
  
  // 如果解析失败，返回原内容
  if (importStatements.length === 0) {
    return { 
      modified: false, 
      sortedImports: firstBlock.content, 
      startOffset: firstBlock.startOffset, 
      endOffset: firstBlock.endOffset 
    };
  }

  // 应用分组规则
  const groupedImports = categorizeImports(importStatements);
  
  // 排序
  const sortedImports = sortImportsByRules(groupedImports, options);
  
  // 格式化输出（分组间无空行，最后有空行）
  const formattedImports = formatImportsWithoutSpaces(sortedImports, options);
  
  return {
    modified: formattedImports !== firstBlock.content,
    sortedImports: formattedImports,
    startOffset: firstBlock.startOffset,
    endOffset: firstBlock.endOffset
  };
}

/**
 * 查找import块（包含位置信息）
 */
function findImportBlocksWithOffsets(text: string): Array<{
  content: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}> {
  const lines = text.split('\n');
  const blocks: Array<{
    content: string;
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  }> = [];
  
  let currentBlock: string[] = [];
  let inImportBlock = false;
  let startLine = 0;
  let startOffset = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // 检查是否是import语句或import的续行
    const isImportLine = trimmedLine.startsWith('import') || 
                        (inImportBlock && 
                         (trimmedLine.startsWith('{') || 
                          trimmedLine.includes('} from') || 
                          trimmedLine.startsWith('} from')));
    
    // import块内的空行或注释
    const isImportRelated = inImportBlock && 
                           (trimmedLine === '' || 
                            trimmedLine.startsWith('//') || 
                            trimmedLine.startsWith('/*'));
    
    if (isImportLine) {
      if (!inImportBlock) {
        inImportBlock = true;
        startLine = i;
        startOffset = text.indexOf(line, startOffset);
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    } else if (isImportRelated) {
      // 保留import块内的空行和注释
      currentBlock.push(line);
    } else if (inImportBlock) {
      // import块结束
      if (currentBlock.length > 0) {
        const endLine = i - 1;
        const blockContent = currentBlock.join('\n');
        const endOffset = startOffset + blockContent.length;
        
        blocks.push({
          content: blockContent,
          startLine,
          endLine,
          startOffset,
          endOffset
        });
      }
      
      inImportBlock = false;
      currentBlock = [];
    }
  }
  
  // 处理文件末尾的import块
  if (inImportBlock && currentBlock.length > 0) {
    const endLine = lines.length - 1;
    const blockContent = currentBlock.join('\n');
    const endOffset = startOffset + blockContent.length;
    
    blocks.push({
      content: blockContent,
      startLine,
      endLine,
      startOffset,
      endOffset
    });
  }
  
  return blocks;
}

/**
 * 解析import块
 */
function parseImportBlock(blockContent: string, startLine: number, options: SortOptions): ImportStatement[] {
  const lines = blockContent.split('\n');
  const imports: ImportStatement[] = [];
  
  let currentImportLines: string[] = [];
  let currentStartLine = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    const trimmedLine = originalLine.trim();
    
    // 跳过纯空行和注释行（但保留它们作为原始行的一部分）
    if (trimmedLine === '' || trimmedLine.startsWith('//') || 
        (trimmedLine.startsWith('/*') && trimmedLine.endsWith('*/'))) {
      // 如果当前正在收集import语句，将空行/注释加入
      if (currentImportLines.length > 0) {
        currentImportLines.push(originalLine);
      }
      continue;
    }
    
    if (currentImportLines.length === 0) {
      currentStartLine = startLine + i;
    }
    
    currentImportLines.push(originalLine);
    
    // 检查import语句是否完整
    const combined = currentImportLines.map(l => l.trim()).join(' ');
    if (combined.endsWith(';') || 
        (combined.includes(' from ') && (combined.includes("'") || combined.includes('"'))) ||
        (combined.startsWith('import ') && (combined.includes("'") || combined.includes('"')) && !combined.includes(' from '))) {
      
      const parsed = parseSingleImport(currentImportLines, currentStartLine, options);
      if (parsed) {
        imports.push(parsed);
      }
      currentImportLines = [];
    }
  }
  
  // 处理最后未结束的import（不规范的代码）
  if (currentImportLines.length > 0) {
    const parsed = parseSingleImport(currentImportLines, currentStartLine, options);
    if (parsed) {
      imports.push(parsed);
    }
  }
  
  return imports;
}

/**
 * 解析单个import语句
 */
function parseSingleImport(originalLines: string[], startLine: number, options: SortOptions): ImportStatement | null {
  const combined = originalLines.map(l => l.trim()).join(' ');
  const cleanText = combined.replace(/;$/, '').trim();
  
  // 1. 副作用导入: import 'module'
  const sideEffectMatch = cleanText.match(/^import\s+['"]([^'"]+)['"]$/);
  if (sideEffectMatch) {
    const modulePath = sideEffectMatch[1];
    const isVueFile = modulePath.endsWith('.vue');
    const isInternalLibrary = options.internalLibPrefixes.some(prefix => modulePath.startsWith(prefix));
    const isExternalLibrary = !isInternalLibrary;
    
    return {
      originalLines,
      fullText: cleanText,
      modulePath,
      group: ImportGroup.PUBLIC_LIBRARY, // 默认值，后续会重新分类
      hasBraces: false,
      isDefault: false,
      isRelative: modulePath.startsWith('.'),
      specifiers: '',
      specifierCount: 0,
      specifiersList: [],
      startLine,
      endLine: startLine + originalLines.length - 1,
      isVueFile,
      isInternalLibrary,
      isExternalLibrary
    };
  }
  
  // 2. 普通导入: import x from 'module'
  const importMatch = cleanText.match(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"]$/);
  if (!importMatch) {
    return null;
  }
  
  const specifiers = importMatch[1];
  const modulePath = importMatch[2];
  const hasBraces = specifiers.includes('{');
  const isDefault = !hasBraces || specifiers.includes(',');
  const isRelative = modulePath.startsWith('.');
  const isVueFile = modulePath.endsWith('.vue');
  
  // 检查是否为内部库
  const isInternalLibrary = options.internalLibPrefixes.some(prefix => modulePath.startsWith(prefix)) || 
                           isRelative;
  const isExternalLibrary = !isInternalLibrary;
  
  // 解析导入项
  let specifierCount = 0;
  let specifiersList: string[] = [];
  
  if (hasBraces) {
    const braceMatch = specifiers.match(/\{([^}]+)\}/);
    if (braceMatch) {
      const items = braceMatch[1].split(',').map(s => s.trim()).filter(s => s);
      specifierCount = items.length;
      specifiersList = items;
    }
  } else {
    specifierCount = 1;
    specifiersList = [specifiers.replace(/\s+as\s+.+$/, '')];
  }
  
  return {
    originalLines,
    fullText: cleanText,
    modulePath,
    group: ImportGroup.PUBLIC_LIBRARY, // 默认值，后续会重新分类
    hasBraces,
    isDefault,
    isRelative,
    specifiers,
    specifierCount,
    specifiersList,
    startLine,
    endLine: startLine + originalLines.length - 1,
    isVueFile,
    isInternalLibrary,
    isExternalLibrary
  };
}

/**
 * 重新分类import语句
 */
function categorizeImports(imports: ImportStatement[]): ImportStatement[] {
  return imports.map(imp => {
    const newImp = { ...imp };
    
    // 1. 首先判断是否为.vue文件
    if (imp.isVueFile) {
      // 所有.vue文件都是组件
      if (imp.isExternalLibrary) {
        // 外部库的.vue组件（如element-plus等UI库）
        newImp.group = ImportGroup.PUBLIC_COMPONENT;
      } else {
        // 本地.vue组件（包括@@@/开头的）
        newImp.group = ImportGroup.LOCAL_COMPONENT;
      }
    } 
    // 2. 非.vue文件
    else if (imp.hasBraces) {
      // 有{}的导入，判断为工具函数
      if (imp.isExternalLibrary) {
        // 第三方库中的工具函数
        newImp.group = ImportGroup.PUBLIC_UTILITY;
      } else {
        // 本地工具函数
        newImp.group = ImportGroup.LOCAL_UTILITY;
      }
    }
    // 3. 默认导入（无{}）或副作用导入
    else {
      if (imp.isExternalLibrary) {
        // 第三方库
        newImp.group = ImportGroup.PUBLIC_LIBRARY;
      } else {
        // 本地库
        newImp.group = ImportGroup.LOCAL_LIBRARY;
      }
    }
    
    return newImp;
  });
}

/**
 * 按照规则排序import语句
 */
function sortImportsByRules(imports: ImportStatement[], options: SortOptions): ImportStatement[] {
  // 分组顺序定义
  const groupOrder = [
    ImportGroup.PUBLIC_COMPONENT,
    ImportGroup.LOCAL_COMPONENT,
    ImportGroup.PUBLIC_UTILITY,
    ImportGroup.LOCAL_UTILITY,
    ImportGroup.PUBLIC_LIBRARY,
    ImportGroup.LOCAL_LIBRARY
  ];
  
  return imports.sort((a, b) => {
    // 1. 按分组排序
    const groupIndexA = groupOrder.indexOf(a.group);
    const groupIndexB = groupOrder.indexOf(b.group);
    if (groupIndexA !== groupIndexB) {
      return groupIndexA - groupIndexB;
    }
    
    // 2. 按分块长度由短到长排序
    if (options.sortByLength) {
      // 先按导入项数量排序
      if (a.specifierCount !== b.specifierCount) {
        return a.specifierCount - b.specifierCount;
      }
      
      // 相同导入项数量时，按字符串长度排序
      const lengthDiff = a.fullText.length - b.fullText.length;
      if (lengthDiff !== 0) {
        return lengthDiff;
      }
    }
    
    // 3. 按模块路径字母顺序排序
    const pathCompare = a.modulePath.localeCompare(b.modulePath);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    
    // 4. 相同模块内：先默认导入，后命名导入
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? -1 : 1;
    }
    
    // 5. 按导入项字母顺序
    if (a.specifiersList.length > 0 && b.specifiersList.length > 0) {
      return a.specifiersList[0].localeCompare(b.specifiersList[0]);
    }
    
    return 0;
  });
}

/**
 * 格式化import语句（分组间无空行，最后有空行）
 */
function formatImportsWithoutSpaces(imports: ImportStatement[], options: SortOptions): string {
  if (imports.length === 0) {
    return '';
  }
  
  const result: string[] = [];
  let currentGroup: ImportGroup | null = null;
  
  for (const imp of imports) {
    // 检查是否需要添加分组注释
    if (currentGroup !== imp.group) {
      // 添加分组注释
      if (options.addGroupComments && options.groupNames) {
        const comment = `// ${options.groupNames[imp.group]}`;
        result.push(comment);
      }
      currentGroup = imp.group;
    }
    
    // 添加import语句
    result.push(...formatImportStatement(imp));
  }
  
  // 在所有import语句后添加一个空行，与后续代码分隔
  result.push('');
  
  return result.join('\n');
}

/**
 * 格式化单个import语句
 */
function formatImportStatement(imp: ImportStatement): string[] {
  // 如果是单行import，直接返回原始行（确保以分号结尾）
  if (imp.originalLines.length === 1) {
    const line = imp.originalLines[0].trim();
    return [line.endsWith(';') ? line : `${line};`];
  }
  
  // 多行import，重新格式化
  const fullImport = `${imp.fullText};`;
  
  // 如果是长导入（多个导入项），保持多行格式
  if (imp.hasBraces && imp.specifierCount > 1) {
    const fromPart = ` from '${imp.modulePath}';`;
    const braceMatch = imp.specifiers.match(/\{([^}]+)\}/);
    
    if (braceMatch) {
      // 对导入项进行字母排序
      const items = braceMatch[1].split(',').map(s => s.trim()).sort();
      const formattedItems = items.map((item, index) => 
        `  ${item}${index < items.length - 1 ? ',' : ''}`
      );
      
      return [
        'import {',
        ...formattedItems,
        `}${fromPart}`
      ];
    }
  }
  
  return [fullImport];
}


export function register(context: vscode.ExtensionContext) {
	const sortImportsCommand = vscode.commands.registerCommand('yongutils.sortImports', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('没有活动的编辑器');
      return;
    }

    const document = editor.document;
    const languageId = document.languageId;
    
    // 只处理特定文件类型
    if (!['javascript', 'typescript', 'vue'].includes(languageId)) {
      vscode.window.showWarningMessage('当前文件类型不支持自动排序Imports');
      return;
    }

    // 获取用户配置
    const config = vscode.workspace.getConfiguration('importSorter');
    const options: SortOptions = {
      addGroupComments: config.get<boolean>('addGroupComments', true),
      sortByLength: config.get<boolean>('sortByLength', true),
      groupNames: config.get<Record<ImportGroup, string>>('customGroupNames', {
        [ImportGroup.PUBLIC_COMPONENT]: '公共组件',
        [ImportGroup.LOCAL_COMPONENT]: '本地组件', 
        [ImportGroup.PUBLIC_UTILITY]: '公共工具函数',
        [ImportGroup.LOCAL_UTILITY]: '本地工具函数',
        [ImportGroup.PUBLIC_LIBRARY]: '公共库',
        [ImportGroup.LOCAL_LIBRARY]: '本地库'
      }),
      internalLibPrefixes: config.get<string[]>('internalLibPrefixes', ['@@@/', '@@/', '@/', './', '../'])
    };

    try {
      // 使用WorkspaceEdit确保只替换import块
      const edit = new vscode.WorkspaceEdit();
      const fullText = document.getText();
      const result = sortImportsInDocument(fullText, options);
      
      if (result.modified) {
        // 计算替换范围
        const startPos = document.positionAt(result.startOffset);
        const endPos = document.positionAt(result.endOffset);
        const range = new vscode.Range(startPos, endPos);
        
        // 替换import块
        edit.replace(document.uri, range, result.sortedImports);
        
        // 应用编辑
        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
          vscode.window.showInformationMessage('Imports 排序完成！');
        } else {
          vscode.window.showErrorMessage('排序失败：无法应用编辑');
        }
      } else {
        vscode.window.showInformationMessage('Imports 已经是排序状态');
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`排序失败: ${error.message}`);
    }
  });

  context.subscriptions.push(sortImportsCommand);
}

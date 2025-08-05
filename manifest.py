#
//  manifest.py
//  
//
//  Created by Celestial紗雪 on 2025/8/5.
//


import json
from pathlib import Path

# --- 配置区 ---

# 1. 设置您的网站项目根目录
#    '.' 表示当前目录，即您运行此脚本时所在的目录。
ROOT_DIRECTORY = '.'

# 2. 设置输出的JSON清单文件名
OUTPUT_FILE = 'precache-manifest.json'

# 3. 需要被排除在外的【目录】名称
#    这些目录下的所有文件都将被忽略。
#    例如版本控制工具、Python缓存、VSCode配置等。
DIRS_TO_EXCLUDE = {
    '.git',
    '.vscode',
    '__pycache__',
    # 如果有其他不想缓存的文件夹，在这里添加
}

# 4. 需要被排除在外的【文件】名称
#    例如脚本自身、输出的清单文件等。
FILES_TO_EXCLUDE = {
    'generate_manifest.py',  # 排除脚本本身
    OUTPUT_FILE,             # 排除输出文件本身
    # 如果有其他不想缓存的特定文件，在这里添加
}


# --- 主逻辑 ---

def generate_manifest():
    """
    扫描目录，生成预缓存清单 (precache-manifest.json)。
    """
    print("开始扫描文件...")
    
    root_path = Path(ROOT_DIRECTORY)
    all_file_paths = []

    # 使用 rglob('**/*') 递归查找所有文件和目录
    for path in root_path.rglob('**/*'):
        # 确保它是一个文件，而不是目录
        if not path.is_file():
            continue

        # 检查文件的任何父目录是否在排除列表中
        # set.isdisjoint() 检查两个集合是否有共同元素，效率高
        if not DIRS_TO_EXCLUDE.isdisjoint(set(p.name for p in path.parents)):
            print(f"  -> 忽略 (在排除目录中): {path}")
            continue
            
        # 检查文件名是否在排除列表中
        if path.name in FILES_TO_EXCLUDE:
            print(f"  -> 忽略 (在排除文件中): {path}")
            continue

        # 将本地文件路径转换为Web相对路径 (例如 C:\www\css\style.css -> ./css/style.css)
        # as_posix() 确保路径分隔符是 /，而不是 Windows 的 \
        relative_path = f"./{path.relative_to(root_path).as_posix()}"
        all_file_paths.append(relative_path)

    # 根目录本身也需要被缓存，通常指向 index.html
    # 我们把它加在列表的最前面
    all_file_paths.insert(0, './')

    print(f"\n扫描完成！共找到 {len(all_file_paths)} 个文件需要缓存。")

    # 将文件列表写入JSON文件
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            # indent=2 让JSON文件格式化，更易读
            # ensure_ascii=False 确保中文等字符正常显示
            json.dump(all_file_paths, f, indent=2, ensure_ascii=False)
        print(f"成功生成清单文件: {OUTPUT_FILE}")
    except IOError as e:
        print(f"错误：无法写入文件 {OUTPUT_FILE}。 {e}")

# --- 运行脚本 ---
if __name__ == "__main__":
    generate_manifest()
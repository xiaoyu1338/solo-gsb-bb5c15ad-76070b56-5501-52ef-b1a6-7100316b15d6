import { useRef, useState } from 'react';

interface Props {
  fileName: string;
  onLoad: (content: string, name: string) => void;
}

export function ImportBar({ fileName, onLoad }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onLoad(String(reader.result ?? ''), file.name);
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="panel">
      <h2>导入 SRT 字幕</h2>
      <div
        className={'dropzone' + (dragging ? ' dragging' : '')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
      >
        点击选择或拖拽 <b>.srt</b> 文件到此处
        {fileName && (
          <div className="filename" style={{ marginTop: 8 }}>
            当前文件：{fileName}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".srt,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

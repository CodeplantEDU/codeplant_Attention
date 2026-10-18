"""Extract text only; uploaded documents never execute code or macros."""
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def extract(data, suffix):
    warning = ""
    if suffix == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise ValueError("PDF 파일 형식이 아닙니다.")
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError("PDF 읽기 준비가 필요합니다: python -m pip install -r requirements.txt")
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValueError("암호가 없는 PDF로 저장한 뒤 올려주세요.")
        pages = []
        empty = 0
        for i, page in enumerate(reader.pages, 1):
            content = page.extract_text() or ""
            empty += not bool(content.strip())
            pages.append(f"[페이지 {i}]\n{content}")
        text = "\n\n".join(pages)
        if empty == len(pages):
            raise ValueError("읽을 수 있는 텍스트가 없습니다. 스캔 PDF는 OCR 후 올려주세요.")
        if empty:
            warning = f"텍스트 없는 페이지 {empty}개는 읽지 못했습니다. 이미지·도표는 해석하지 않습니다."
        else:
            warning = "텍스트만 읽었습니다. 이미지·도표와 복잡한 표 배치는 확인이 필요합니다."
    elif suffix in (".docx", ".pptx"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if len(archive.infolist()) > 5000 or sum(x.file_size for x in archive.infolist()) > 80 * 1024 * 1024:
                raise ValueError("문서 압축 해제 크기가 너무 큽니다.")
            names = ["word/document.xml"] if suffix == ".docx" else sorted(
                [x for x in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", x)],
                key=lambda x: int(re.search(r"slide(\d+)\.xml", x).group(1)))
            if not names:
                raise ValueError("읽을 본문이 없습니다.")
            blocks = []
            for i, name in enumerate(names, 1):
                xml = archive.read(name)
                if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
                    raise ValueError("외부 엔티티가 있는 문서는 지원하지 않습니다.")
                root = ET.fromstring(xml)
                paragraphs = []
                for node in root.iter():
                    if node.tag.rsplit("}", 1)[-1] == "p":
                        paragraphs.append("".join(n.text or "" for n in node.iter() if n.tag.rsplit("}", 1)[-1] == "t"))
                blocks.append((f"[슬라이드 {i}]\n" if suffix == ".pptx" else "") + "\n".join(paragraphs))
            text = "\n\n".join(blocks)
            warning = "본문 텍스트만 읽었습니다. 이미지·도표·메모·첨부 개체는 포함하지 않습니다."
    else:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("cp949")
        if "\x00" in text:
            raise ValueError("텍스트 파일의 인코딩을 UTF-8로 바꿔주세요.")
    text = text.strip()
    if not text or not re.sub(r"\[(페이지|슬라이드) \d+\]", "", text).strip():
        raise ValueError("읽을 수 있는 본문 텍스트가 없습니다.")
    return {"text": text, "warning": warning}


if __name__ == "__main__":
    try:
        source = Path(sys.argv[1])
        print(json.dumps(extract(source.read_bytes(), source.suffix.lower()), ensure_ascii=True))
    except Exception as exc:
        message = str(exc) if isinstance(exc, ValueError) else "문서 텍스트를 읽지 못했습니다. 정상 파일과 형식을 확인하세요."
        print(json.dumps({"error": message}, ensure_ascii=True))
        sys.exit(1)

import io
import sys
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from extract import extract


def office(name, xml):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as z:
        z.writestr(name, xml)
    return output.getvalue()


class ExtractionTests(unittest.TestCase):
    def test_docx_and_pptx(self):
        for suffix, name, xml in [
            (".docx", "word/document.xml", '<w:document xmlns:w="urn:w"><w:p><w:r><w:t>공개 자료</w:t></w:r></w:p></w:document>'),
            (".pptx", "ppt/slides/slide1.xml", '<a:p xmlns:a="urn:a"><a:r><a:t>슬라이드 자료</a:t></a:r></a:p>')]:
            result = extract(office(name, xml), suffix)
            self.assertIn("자료", result["text"])
            self.assertTrue(result["warning"])

    def test_plain_encoding_and_bad_pdf(self):
        self.assertEqual(extract("한글".encode("cp949"), ".txt")["text"], "한글")
        with self.assertRaises(ValueError):
            extract(b"not pdf", ".pdf")
        self.assertEqual(len(extract(b"x" * 60001, ".txt")["text"]), 60001)

    def test_large_text_and_many_slides(self):
        body = "x" * 60001
        xml = '<w:document xmlns:w="urn:w"><w:p><w:r><w:t>' + body + '</w:t></w:r></w:p></w:document>'
        self.assertEqual(len(extract(office("word/document.xml", xml), ".docx")["text"]), 60001)
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            for number in range(1, 302):
                archive.writestr(f"ppt/slides/slide{number}.xml", '<a:p xmlns:a="urn:a"><a:r><a:t>Public slide</a:t></a:r></a:p>')
        self.assertIn("[슬라이드 301]", extract(output.getvalue(), ".pptx")["text"])

    def test_xml_entity_rejected(self):
        with self.assertRaises(ValueError):
            extract(office("word/document.xml", '<!DOCTYPE foo><root/>'), ".docx")

    def test_pdf_pages_and_empty_scan(self):
        from pypdf import PdfWriter
        from pypdf.generic import DecodedStreamObject, NameObject, DictionaryObject
        writer = PdfWriter()
        page = writer.add_blank_page(width=600, height=800)
        font = DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
        stream = DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 50 700 Td (Public reference 120 minutes) Tj ET')
        page[NameObject('/Contents')] = writer._add_object(stream)
        for _ in range(300):
            writer.add_blank_page(width=100, height=100)
        output = io.BytesIO();writer.write(output)
        self.assertIn('120 minutes', extract(output.getvalue(), '.pdf')['text'])
        blank = PdfWriter();blank.add_blank_page(width=100, height=100);out = io.BytesIO();blank.write(out)
        with self.assertRaisesRegex(ValueError, 'OCR'):
            extract(out.getvalue(), '.pdf')


if __name__ == '__main__':
    unittest.main()

import fitz

source = "scratch/kyoto-map-mockup.pdf"
output = ".agents/outputs/kyoto-map-mockup-page.png"
doc = fitz.open(source)
page = doc[0]
pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
pix.save(output)
print({"pages": len(doc), "page_size": [page.rect.width, page.rect.height], "output": output})
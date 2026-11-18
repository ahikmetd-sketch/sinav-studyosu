"""Latin Modern OTF yazı tiplerini jsPDF için alt kümelenmiş TrueType'a çevirir (assets/fonts/lm/).
Gerekir: pip install fonttools; TeX Live'daki lm OTF dosyaları."""
import sys
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools import subset
CHARS = (''.join(chr(c) for c in range(0x20,0x7f)) + ''.join(chr(c) for c in range(0xa0,0x180)) +
         '’‘“”–—…•′″€·×÷−')
def convert(src, dst):
    # önce alt küme (CFF üzerinde), sonra TrueType'a çevir
    opts = subset.Options(); opts.layout_features=[]; opts.name_IDs=['*']; opts.notdef_outline=True
    f = TTFont(src)
    sub = subset.Subsetter(opts); sub.populate(text=CHARS); sub.subset(f)
    gs = f.getGlyphSet(); order = f.getGlyphOrder()
    glyf = newTable('glyf'); glyf.glyphOrder = order; glyf.glyphs = {}
    for name in order:
        pen = TTGlyphPen(gs)
        try: gs[name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        except Exception: pass
        glyf.glyphs[name] = pen.glyph()
    f['glyf'] = glyf; f['loca'] = newTable('loca')
    for t in ('CFF ', 'VORG'):
        if t in f: del f[t]
    maxp = f['maxp']; maxp.tableVersion = 0x00010000
    for a in ('maxZones','maxTwilightPoints','maxStorage','maxFunctionDefs','maxInstructionDefs','maxStackElements','maxSizeOfInstructions','maxComponentElements'):
        setattr(maxp, a, 0)
    maxp.maxZones = 1
    f['head'].indexToLocFormat = 0; f['head'].glyphDataFormat = 0
    f['post'].formatType = 2.0; f['post'].extraNames = []; f['post'].mapping = {}
    f.sfntVersion = '\x00\x01\x00\x00'
    f.save(dst)
import os
# Latin Modern OTF klasörü (TeX Live); LM_DIR ortam değişkeniyle değiştirilebilir
B=os.environ.get('LM_DIR', '/usr/share/texmf/fonts/opentype/public/lm/')
for src,dst in [('lmroman10-regular','rm'),('lmroman10-bold','rmb'),('lmroman10-italic','rmi'),('lmsans10-regular','sf'),('lmsans10-bold','sfb')]:
    convert(B+src+'.otf', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'fonts', 'lm', dst+'.ttf'))

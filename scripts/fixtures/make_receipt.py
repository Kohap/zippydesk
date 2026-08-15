from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 1400
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)

def font(size, bold=True):
    return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size, index=1 if bold else 0)

F = {
    "h1": font(52, True), "sub": font(24, False),
    "status": font(40, True), "label": font(26, False),
    "small": font(28, False), "med": font(34, False),
    "value": font(30, True), "amount": font(52, True),
}

d.rectangle([0, 0, W, 150], fill="#0b5394")
d.text((60, 35), "GTBANK", font=F["h1"], fill="#ffffff")
d.text((60, 100), "Guaranty Trust Bank · Payment Confirmation", font=F["sub"], fill="#cfe2f3")
d.line([(60, 190), (940, 190)], fill="#d5d5d5", width=4)
d.text((60, 220), "TRANSACTION STATUS", font=F["label"], fill="#555555")
d.text((60, 265), "SUCCESSFUL", font=F["status"], fill="#1e7e34")
d.line([(60, 340), (940, 340)], fill="#d5d5d5", width=4)

rows = [
    ("Sender", "AMARA OKONKWO", None),
    ("Beneficiary", "PARFAIT PALACE", None),
    ("Beneficiary Bank", "GTBank (012)", None),
    ("Beneficiary Account", "0123456789", None),
]
y = 390
for label, value, _ in rows:
    d.text((60, y), label, font=F["small"], fill="#555555")
    d.text((60, y + 45), value, font=F["value"], fill="#111111")
    y += 140
d.line([(60, y + 15), (940, y + 15)], fill="#d5d5d5", width=4)

y += 55
d.text((60, y), "Narration", font=F["small"], fill="#555555")
d.text((560, y), "GFT-A3-1001", font=F["value"], fill="#111111")
y += 90
d.text((60, y), "Amount", font=F["small"], fill="#555555")
d.text((560, y), "NGN 5,000.00", font=F["amount"], fill="#0b5394")
y += 100
d.text((60, y), "Date", font=F["small"], fill="#555555")
d.text((560, y), "14 Aug 2026, 10:42 AM", font=F["small"], fill="#111111")
y += 90
d.text((60, y), "Transaction Reference", font=F["small"], fill="#555555")
d.text((560, y), "GTB-2408141042-8831", font=F["small"], fill="#111111")

img.save("scripts/fixtures/receipt.png")
print("saved", img.size)

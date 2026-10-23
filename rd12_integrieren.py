"""RD 12 in alle Tabellen einfuegen."""
import rhino3dm, json, csv, math
model=rhino3dm.File3dm.FromByteArray(open("data/Stockerau Rhino Export from RFEM.3dm","rb").read())
A=math.pi*(0.012/2)**2; d=7850
rd=[]
for i in range(len(model.Objects)):
    o=model.Objects[i]; g=o.Geometry; a=o.Attributes
    li=a.LayerIndex; ln=model.Layers[li].Name if 0<=li<len(model.Layers) else ""
    if ln!="RD 12" or type(g).__name__!="LineCurve": continue
    fp,tp=g.PointAtStart,g.PointAtEnd
    L=math.sqrt((tp.X-fp.X)**2+(tp.Y-fp.Y)**2+(tp.Z-fp.Z)**2)
    rd.append({"u":str(a.Id),"n":a.Name or "","fx":fp.X,"fy":fp.Y,"fz":fp.Z,"tx":tp.X,"ty":tp.Y,"tz":tp.Z,"L":round(L,4),"oi":i})
print(f"RD 12: {len(rd)} Staebe")

with open("data/staebe_mit_querschnitt.json") as f: qs=json.load(f)
with open("data/staebe_mit_material.json") as f: mt=json.load(f)
with open("data/staebe_mit_co2.json") as f: c2=json.load(f)

for r in rd:
    V=A*r["L"]; m=V*d
    qs.append({"lc_uuid":r["u"],"br_uuid":"","layer":"RD 12","laenge_m":r["L"],"dicke_m":0.012,"breite1_m":0.012,"breite2_m":0.012,"A1_m2":A,"A2_m2":A,"A_avg_m2":A,"volumen_m3":round(V,8),"methode":"rundstab_konstant"})
    mt.append({"lc_uuid":r["u"],"br_uuid":"","layer":"RD 12","laenge_m":r["L"],"volumen_m3":round(V,8),"material":"Baustahl S355JR","material_category":"Stahl","material_standard":"DIN EN 10025-2 (S355JR)","decision_level":"regelbasiert (Team-Vorgabe)","reasoning":"Rundstab 12mm - Baustahl","name":r["n"]})
    c2.append({"lc_uuid":r["u"],"layer":"RD 12","material":"Baustahl S355JR","datensatz":"Baustahl S355JR","volumen_m3":round(V,8),"masse_kg":round(m,4),"laenge_m":r["L"],"co2_A1A3_kg":round(m*0.560287,6),"co2_C_sum_kg":round(m*0.004848,6),"co2_D_kg":round(m*0.209625,6),"bewehrung_kg":0,"bewehrung_co2_A1A3_kg":0})

json.dump(qs,open("data/staebe_mit_querschnitt.json","w"),indent=2,ensure_ascii=False,default=str)
json.dump(mt,open("data/staebe_mit_material.json","w"),indent=2,ensure_ascii=False,default=str)
json.dump(c2,open("data/staebe_mit_co2.json","w"),indent=2,ensure_ascii=False,default=str)

def wcsv(p,d,f):
    with open(p,"w",newline="",encoding="utf-8-sig") as o:
        w=csv.DictWriter(o,fieldnames=f,extrasaction="ignore"); w.writeheader()
        for x in d: w.writerow({h:x.get(h,"") for h in f})
wcsv("data/staebe_mit_querschnitt.csv",qs,["lc_uuid","br_uuid","layer","laenge_m","dicke_m","breite1_m","breite2_m","A1_m2","A2_m2","A_avg_m2","volumen_m3","methode"])
wcsv("data/staebe_mit_material.csv",mt,["lc_uuid","br_uuid","layer","laenge_m","volumen_m3","material","material_category","material_standard","decision_level","reasoning","name"])
wcsv("data/staebe_mit_co2.csv",c2,["lc_uuid","layer","material","datensatz","volumen_m3","masse_kg","laenge_m","co2_A1A3_kg","co2_C_sum_kg","co2_D_kg","bewehrung_kg","bewehrung_co2_A1A3_kg"])
print(f"QS={len(qs)} MAT={len(mt)} CO2={len(c2)}")
from collections import Counter
for m,n in Counter(x["material"] for x in mt).most_common(): print(f"  {m}: {n}")
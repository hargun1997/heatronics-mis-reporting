// Built-in FG Master data from Tranzact
// Update this when items change in Tranzact (name, unit, price)
export interface FgMasterEntry {
  itemId: string;
  itemName: string;
  unit: string;
  defaultPrice: number;
}

export const fgMaster: Record<string, FgMasterEntry> = {
  "FG-0001": { itemId: "FG-0001", itemName: "HTR-HP-XL-A (Steel Blue)", unit: "pcs", defaultPrice: 975 },
  "FG-0002": { itemId: "FG-0002", itemName: "HTR-HP-XL-D (Steel Blue)", unit: "pcs", defaultPrice: 1387.5 },
  "FG-0003": { itemId: "FG-0003", itemName: "HTR-HP-R-D (Steel Blue)", unit: "pcs", defaultPrice: 1275 },
  "FG-0004": { itemId: "FG-0004", itemName: "HTR-HP-R-A (Steel Blue)", unit: "pcs", defaultPrice: 862.5 },
  "FG-0005": { itemId: "FG-0005", itemName: "HTR-KHP-A (Steel Blue)", unit: "pcs", defaultPrice: 900 },
  "FG-0006": { itemId: "FG-0006", itemName: "HTR-KHP-D (Steel Blue)", unit: "pcs", defaultPrice: 1312.5 },
  "FG-0007": { itemId: "FG-0007", itemName: "HTR-CHP-A (Dark Grey)", unit: "pcs", defaultPrice: 1575 },
  "FG-0008": { itemId: "FG-0008", itemName: "HTR-CHP-D (Dark Gray)", unit: "pcs", defaultPrice: 1987.5 },
  "FG-0009": { itemId: "FG-0009", itemName: "HTR-FW-A (Steel Blue)", unit: "pcs", defaultPrice: 1575 },
  "FG-0010": { itemId: "FG-0010", itemName: "HTR-FW-D (Steel Blue)", unit: "pcs", defaultPrice: 1987.5 },
  "FG-0011": { itemId: "FG-0011", itemName: "HTR-BW-Single-A (Light Grey)", unit: "pcs", defaultPrice: 1987.5 },
  "FG-0012": { itemId: "FG-0012", itemName: "HTR-BW-Single-D (Light Grey)", unit: "pcs", defaultPrice: 2400 },
  "FG-0013": { itemId: "FG-0013", itemName: "HTR-BW-Double-A (Light Grey)", unit: "pcs", defaultPrice: 3750 },
  "FG-0014": { itemId: "FG-0014", itemName: "HTR-BW-Double-D (Light Grey)", unit: "pcs", defaultPrice: 4162.5 },
  "FG-0015": { itemId: "FG-0015", itemName: "HTR-HBR-Regular-A (Light Grey)", unit: "pcs", defaultPrice: 1725 },
  "FG-0016": { itemId: "FG-0016", itemName: "HTR-HBR-Regular-D (Light Grey)", unit: "pcs", defaultPrice: 2137.5 },
  "FG-0017": { itemId: "FG-0017", itemName: "HTR-HBR-Executive-A (Light Grey)", unit: "pcs", defaultPrice: 2175 },
  "FG-0018": { itemId: "FG-0018", itemName: "Healthsense-HP-U-A", unit: "pcs", defaultPrice: 862.5 },
  "FG-0019": { itemId: "FG-0019", itemName: "HTR-Hot_Water_Bottle", unit: "pcs", defaultPrice: 360 },
  "FG-0020": { itemId: "FG-0020", itemName: "HTR-HP-XL-A (Light Grey)", unit: "pcs", defaultPrice: 975 },
  "FG-0021": { itemId: "FG-0021", itemName: "HTR-Tennis_Elbow", unit: "pcs", defaultPrice: 450 },
  "FG-0022": { itemId: "FG-0022", itemName: "Heatronics-Knee_Binder", unit: "pcs", defaultPrice: 450 },
  "FG-0023": { itemId: "FG-0023", itemName: "HTR-Tummy_Trimmer", unit: "pcs", defaultPrice: 500 },
  "FG-0024": { itemId: "FG-0024", itemName: "Fedora-HP-R-A (Light Grey)", unit: "pcs", defaultPrice: 325 },
  "FG-0025": { itemId: "FG-0025", itemName: "Coronation-PVC-HP-R-Beige", unit: "pcs", defaultPrice: 325 },
  "FG-0026": { itemId: "FG-0026", itemName: "Infi-Regular-Analog-Blue", unit: "pcs", defaultPrice: 0 },
  "FG-0027": { itemId: "FG-0027", itemName: "HTR-HP-XL-D (Light Grey)", unit: "pcs", defaultPrice: 0 },
  "FG-0028": { itemId: "FG-0028", itemName: "Dipnish-HP-R-A (Light Grey)", unit: "pcs", defaultPrice: 0 },
};

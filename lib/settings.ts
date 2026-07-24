export const settingDefaults = {
  cong_suat_bep_mac_dinh_kw: 2,
  gia_dien_d_kwh: 3_000,
  dien_khac_moi_me_d: 0,
  nuoc_ve_sinh_moi_me_d: 5_000,
  overhead_bien_doi: 0.05,
  so_ly_du_kien_thang: 1_000,
  chi_phi_co_dinh_thang_d: 0,
} as const;

export type EditableSettingKey = keyof typeof settingDefaults;

export const editableSettingDefinitions = [
  {
    key: "cong_suat_bep_mac_dinh_kw",
    label: "Công suất bếp mặc định",
    unit: "kW",
    defaultValue: settingDefaults.cong_suat_bep_mac_dinh_kw,
  },
  {
    key: "gia_dien_d_kwh",
    label: "Giá điện",
    unit: "đ/kWh",
    defaultValue: settingDefaults.gia_dien_d_kwh,
  },
  {
    key: "dien_khac_moi_me_d",
    label: "Điện khác mỗi mẻ",
    unit: "đ",
    defaultValue: settingDefaults.dien_khac_moi_me_d,
  },
  {
    key: "nuoc_ve_sinh_moi_me_d",
    label: "Nước/vệ sinh mỗi mẻ",
    unit: "đ",
    defaultValue: settingDefaults.nuoc_ve_sinh_moi_me_d,
  },
  {
    key: "overhead_bien_doi",
    label: "Overhead biến đổi",
    unit: "tỷ lệ",
    defaultValue: settingDefaults.overhead_bien_doi,
  },
  {
    key: "so_ly_du_kien_thang",
    label: "Số ly dự kiến/tháng",
    unit: "ly",
    defaultValue: settingDefaults.so_ly_du_kien_thang,
  },
  {
    key: "chi_phi_co_dinh_thang_d",
    label: "Chi phí cố định/tháng",
    unit: "đ",
    defaultValue: settingDefaults.chi_phi_co_dinh_thang_d,
  },
] as const;

export function resolveSettingValue(
  values: ReadonlyMap<string, number>,
  key: EditableSettingKey,
) {
  const value = values.get(key);
  return Number.isFinite(value) ? (value as number) : settingDefaults[key];
}

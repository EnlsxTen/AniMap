/**
 * 坐标系转换工具
 *
 * 国内地图（高德/腾讯/百度）使用 GCJ-02（火星坐标系）
 * Apple 地图、Google 地图（国际）使用 WGS-84（国际标准）
 *
 * 直接把 GCJ-02 坐标传给 Apple 地图会有 200-700 米偏差
 * 本文件提供 GCJ-02 ↔ WGS-84 的转换公式
 *
 * 公式参考：开源算法（克里金法逆向逼近）
 */

const PI = Math.PI;
const A = 6378245.0; // 地球长半轴
const EE = 0.00669342162296594323; // 偏心率平方

const transformLat = (x: number, y: number): number => {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
};

const transformLng = (x: number, y: number): number => {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
};

/**
 * 判断坐标是否在中国境内
 * 境外坐标无需转换（GCJ-02 仅在中国境内偏移）
 */
const outOfChina = (lng: number, lat: number): boolean => {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
};

/**
 * GCJ-02 → WGS-84
 * 用于把高德坐标转换为 Apple 地图能正确显示的坐标
 */
export const gcj02ToWgs84 = (lng: number, lat: number): [number, number] => {
  if (outOfChina(lng, lat)) return [lng, lat];

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);

  // 反向偏移
  return [lng * 2 - (lng + dLng), lat * 2 - (lat + dLat)];
};

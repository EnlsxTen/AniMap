import axios from 'axios';

interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export const geocodeAddress = async (address: string): Promise<GeocodingResult> => {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) {
    throw new Error('服务器未配置高德地图服务端 Key，请在地图上手动选点');
  }

  try {
    const response = await axios.get('https://restapi.amap.com/v3/geocode/geo', {
      params: {
        key,
        address,
      },
    });

    if (response.data.status === '1' && response.data.geocodes.length > 0) {
      const location = response.data.geocodes[0].location.split(',');
      return {
        longitude: parseFloat(location[0]),
        latitude: parseFloat(location[1]),
        formattedAddress: response.data.geocodes[0].formatted_address,
      };
    }
    throw new Error('无法识别该地址，请在地图上手动选点');
  } catch (error) {
    console.error('Geocoding error:', error);
    if (error instanceof Error) throw error;
    throw new Error('地址解析失败');
  }
};

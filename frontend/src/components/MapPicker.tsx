import React, { useEffect, useRef, useState, useCallback } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import { AMAP_KEY } from '../utils/amapConfig';

interface MapPickerProps {
  initialLng?: number;
  initialLat?: number;
  initialAddress?: string;
  onLocationSelect: (data: { lng: number; lat: number; address: string }) => void;
}

const MapPicker: React.FC<MapPickerProps> = ({ initialLng, initialLat, initialAddress, onLocationSelect }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [searchText, setSearchText] = useState(initialAddress || '');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(initialAddress || '');
  const searchTimeout = useRef<any>(null);
  const placeSearchRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  useEffect(() => {
    initMap();
    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy();
      }
    };
  }, []);

  const initMap = async () => {
    try {
      const AMap = await AMapLoader.load({
        key: AMAP_KEY,
        version: '2.0',
        plugins: ['AMap.Marker', 'AMap.PlaceSearch', 'AMap.Geocoder', 'AMap.Geolocation', 'AMap.CitySearch'],
      });

      let center: [number, number] = [116.397428, 39.90923];

      if (initialLng && initialLat) {
        center = [initialLng, initialLat];
      } else {
        // IP 定位获取城市中心点
        const citySearch = new AMap.CitySearch();
        await new Promise<void>((resolve) => {
          citySearch.getLocalCity((status: string, result: any) => {
            if (status === 'complete' && result.rectangle) {
              const bounds = result.rectangle.split(';');
              const [lng1, lat1] = bounds[0].split(',').map(Number);
              const [lng2, lat2] = bounds[1].split(',').map(Number);
              center = [(lng1 + lng2) / 2, (lat1 + lat2) / 2];
            }
            resolve();
          });
        });
      }

      const map = new AMap.Map(mapRef.current, {
        zoom: 15,
        center,
        viewMode: '2D',
      });

      mapInstance.current = map;
      amapRef.current = AMap;

      // 初始化搜索和逆地理编码
      placeSearchRef.current = new AMap.PlaceSearch({ pageSize: 6, pageIndex: 1 });
      geocoderRef.current = new AMap.Geocoder();

      // 如果有初始坐标，放置标记
      if (initialLng && initialLat) {
        placeMarker(AMap, map, [initialLng, initialLat]);
      }

      // 点击地图选点
      map.on('click', (e: any) => {
        const lnglat = [e.lnglat.getLng(), e.lnglat.getLat()];
        placeMarker(AMap, map, lnglat);
        reverseGeocode(lnglat[0], lnglat[1]);
      });
    } catch (error) {
      console.error('Failed to load map picker:', error);
    }
  };

  const placeMarker = (AMap: any, map: any, position: number[]) => {
    if (markerRef.current) {
      markerRef.current.setPosition(position);
    } else {
      markerRef.current = new AMap.Marker({
        position,
        draggable: true,
        animation: 'AMAP_ANIMATION_DROP',
      });
      markerRef.current.setMap(map);

      // 拖拽结束后更新地址
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current.getPosition();
        reverseGeocode(pos.lng, pos.lat);
      });
    }
    map.setCenter(position);
  };

  const reverseGeocode = (lng: number, lat: number) => {
    if (!geocoderRef.current) return;
    geocoderRef.current.getAddress([lng, lat], (status: string, result: any) => {
      if (status === 'complete' && result.regeocode) {
        const addr = result.regeocode.formattedAddress;
        setSelectedAddress(addr);
        setSearchText(addr);
        onLocationSelect({ lng, lat, address: addr });
      } else {
        onLocationSelect({ lng, lat, address: '' });
      }
    });
  };

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!text.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeout.current = setTimeout(() => {
      if (!placeSearchRef.current) return;
      placeSearchRef.current.search(text, (status: string, result: any) => {
        if (status === 'complete' && result.poiList) {
          setSearchResults(result.poiList.pois.slice(0, 6));
          setShowResults(true);
        } else {
          setSearchResults([]);
          setShowResults(false);
        }
      });
    }, 300);
  }, []);

  const handleSelectResult = (poi: any) => {
    const AMap = amapRef.current;
    if (!AMap) return;
    const lng = poi.location.lng;
    const lat = poi.location.lat;
    const addr = poi.name + (poi.address ? ` (${poi.address})` : '');

    placeMarker(AMap, mapInstance.current, [lng, lat]);
    mapInstance.current.setZoom(16);
    setSelectedAddress(addr);
    setSearchText(poi.name);
    setShowResults(false);
    onLocationSelect({ lng, lat, address: addr });
  };

  return (
    <div className="space-y-3">
      {/* 搜索框 */}
      <div className="relative">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
            placeholder="搜索地点名称或地址..."
            className="input-kawaii pl-10"
          />
        </div>

        {/* 搜索结果下拉 */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white rounded-xl shadow-card-hover border border-kawaii-100/30 overflow-hidden max-h-64 overflow-y-auto">
            {searchResults.map((poi: any, index: number) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSelectResult(poi)}
                className="w-full text-left px-4 py-3 hover:bg-kawaii-50/50 transition-colors border-b border-gray-50 last:border-b-0"
              >
                <p className="text-sm font-medium text-dark truncate">{poi.name}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{poi.address || poi.cityname}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 地图 */}
      <div
        ref={mapRef}
        className="w-full rounded-2xl overflow-hidden border-2 border-kawaii-100/30"
        style={{ height: '280px' }}
      />

      {/* 已选地址 */}
      {selectedAddress && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-kawaii-50/50 text-sm">
          <svg className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          <span className="text-dark">{selectedAddress}</span>
        </div>
      )}

      <p className="text-xs text-gray-400">点击地图选择位置，或搜索地点名称，也可以拖动标记微调位置</p>
    </div>
  );
};

export default MapPicker;

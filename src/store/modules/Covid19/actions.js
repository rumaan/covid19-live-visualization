import { types } from "./mutations";
import {
  fetchLayers,
  fetchScatterplotLayer,
  fetchGeoJSONLayer
} from "@/api/covid19";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import chroma, { limits, scale } from "chroma-js";

function getRangeIndex(range, item) {
  for (let i = 0; i < range.length - 1; i++) {
    if (item >= range[i] && item <= range[i + 1]) {
      return i;
    }
  }
}

export default {
  /**
   * Sets a layer as active
   */
  setActiveLayer: async ({ state, commit }, { layerId }) => {
    console.log(layerId);
    // set active layer only if the current layer doesn't match the new layer
    if (state.activelayer !== layerId) {
      commit(types.SET_ACTIVE_LAYER, layerId);
    } else {
      return;
    }
  },
  /**
   * Fetches all the available layers
   */
  fetchLayers: async ({ commit }) => {
    try {
      commit(types.SET_LAYER_LOADING, true);
      const response = await fetchLayers();
      const { status, data } = response;
      if (status === 200 && data) {
        /**
         * Store the layers as key value pairs
         */
        let layers = data.reduce((result, layer) => {
          return Object.assign(result, {
            [layer.id]: {
              ...layer
            }
          });
        }, {});
        commit(types.SET_LAYERS, layers);
        commit(types.SET_LAYER_LOADING, false);
      }
    } catch (error) {
      commit(types.SET_LAYER_LOADING, false);

      console.error(error);
    }
  },
  /**
   * Fetches scatterplot Data and buckets the numbers and adds color values
   */
  fetchScatterplotLayerData: async ({ commit }) => {
    try {
      const response = await fetchScatterplotLayer();
      const { status, data } = response;
      if (status === 200 && data) {
        const colors = scale(["#fcba03", "#fc0362"])
          .mode("lch")
          .colors(10)
          .map(item => chroma(item).rgb());
        const numbers = data.reduce(
          (result, item) => {
            result.confirmed.push(item.data.confirmed);
            result.deaths.push(item.data.deaths);
            result.recovered.push(item.data.recovered);
            return result;
          },
          { confirmed: [], deaths: [], recovered: [] }
        );

        const confirmedBuckets = limits(numbers.confirmed, "q", 10);
        const deathsBuckets = limits(numbers.deaths, "q", 10);
        const recoveredBuckets = limits(numbers.recovered, "q", 10);

        const coloredData = data.map(item => {
          return {
            ...item,
            colors: {
              confirmed:
                colors[getRangeIndex(confirmedBuckets, item.data.confirmed)],
              deaths: colors[getRangeIndex(deathsBuckets, item.data.deaths)],
              recovered:
                colors[getRangeIndex(recoveredBuckets, item.data.recovered)]
            }
          };
        });
        commit(types.SET_SCATTER_PLOT_DATA, coloredData);
      }
    } catch (error) {
      console.error(error);
    }
  },

  fetchGeoJSONLayerData: async ({ commit }) => {
    try {
      const response = await fetchGeoJSONLayer();
      const { status, data } = response;
      if (status === 200 && data) {
        const colors = scale(["#f7da8f", "#fc0339"])
          .mode("lch")
          .colors(10)
          .map(item => chroma(item).rgb());
        const numbers = data.features.reduce(
          (result, { properties: item }) => {
            result.confirmed.push(item.data.confirmed);
            result.deaths.push(item.data.deaths);
            result.recovered.push(item.data.recovered);
            return result;
          },
          { confirmed: [], deaths: [], recovered: [] }
        );

        const confirmedBuckets = limits(numbers.confirmed, "q", 10);
        const deathsBuckets = limits(numbers.deaths, "q", 10);
        const recoveredBuckets = limits(numbers.recovered, "q", 10);

        const coloredData = data.features.map(item => {
          return {
            ...item,
            properties: {
              ...item.properties,
              colors: {
                confirmed:
                  colors[
                    getRangeIndex(
                      confirmedBuckets,
                      item.properties.data.confirmed
                    )
                  ],
                deaths:
                  colors[
                    getRangeIndex(deathsBuckets, item.properties.data.deaths)
                  ],
                recovered:
                  colors[
                    getRangeIndex(
                      recoveredBuckets,
                      item.properties.data.recovered
                    )
                  ]
              }
            }
          };
        });
        commit(types.SET_GEO_JSON_DATA, coloredData);
      }
    } catch (error) {
      console.error(error);
    }
  },
  /**
   * Sets active visualization type
   */
  setActiveVisualization: async ({ commit }, visualization) => {
    commit(types.SET_ACTIVE_VISUALIZATION, visualization);
  },
  setPopupData: async ({ commit }, data) => {
    commit(types.SET_POPUP_DATA, data);
  },
  getActiveGeoLayer: async ({ state, commit }) => {
    if (state.activeVisualization === "scatterplot") {
      if (
        state.activeLayer &&
        state.scatterplotData &&
        state.scatterplotData.length > 0
      ) {
        return new ScatterplotLayer({
          id: `${state.activeLayer}_scatter`,
          data: state.scatterplotData,
          pickable: true,
          opacity: 0.8,
          stroked: false,
          filled: true,
          radiusScale: 6,
          radiusMinPixels: 5,
          radiusMaxPixels: 15,
          lineWidthMinPixels: 1,
          getPosition: d => d.location.map(item => parseFloat(item)),
          getRadius: d => d.data[state.activeLayer] * 1000,
          getFillColor: d => {
            if (d.data[state.activeLayer]) return d.colors[state.activeLayer];
            else return [0, 0, 0, 0];
          },
          onHover: (info, event) => {
            if (info.object) {
              const rootElement = event.rootElement;
              const { offsetWidth, offsetHeight } = rootElement;
              const { object, x, y } = info;
              let itemX, itemY;

              if (offsetWidth - x < 300) {
                itemX = offsetWidth - 300;
              } else {
                itemX = x;
              }

              if (offsetHeight - y < 300) {
                itemY = offsetHeight - (250 + (offsetHeight - y));
              } else {
                itemY = y;
              }

              commit(types.SET_POPUP_DATA, {
                title: object.province || object.country,
                description: `${object.country_code} ${object.country}`,
                ...object.data,
                x: itemX,
                y: itemY,
                show: true
              });
            } else {
              commit(types.SET_POPUP_DATA, { show: false });
            }
          }
        });
      }
    } else {
      if (state.activeLayer && state.geojsonData) {
        return new GeoJsonLayer({
          id: `${state.activeLayer}_geojson`,
          data: state.geojsonData,
          dataTransform: data => {
            console.log(data);
            return data;
          },
          pickable: true,
          stroked: false,
          filled: true,
          getFillColor: d => {
            if (d.properties.data[state.activeLayer] !== 0) {
              return d.properties.colors[state.activeLayer];
            } else {
              return [0, 0, 0, 0];
            }
          },
          onHover: (info, event) => {
            if (info.object) {
              const rootElement = event.rootElement;
              const { offsetWidth, offsetHeight } = rootElement;
              const { object, x, y } = info;
              let itemX, itemY;

              if (offsetWidth - x < 300) {
                itemX = offsetWidth - 300;
              } else {
                itemX = x;
              }

              if (offsetHeight - y < 300) {
                itemY = offsetHeight - (250 + (offsetHeight - y));
              } else {
                itemY = y;
              }

              commit(types.SET_POPUP_DATA, {
                title: object.properties.name,
                description: object.id,
                ...object.properties.data,
                x: itemX,
                y: itemY,
                show: true
              });
            } else {
              commit(types.SET_POPUP_DATA, { show: false });
            }
          }
        });
      }
    }
  }
};
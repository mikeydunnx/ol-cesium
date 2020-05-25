import { toContext } from 'ol/render'
import MVT from 'ol/format/MVT'
import { get as getProjection } from 'ol/proj'

import { Vector } from 'ol/layer';

const format = new MVT()
const defaultStyles = new Vector().getStyleFunction();

export class MVTImageryProvider {
  constructor(options) {
    this.ready = false;
    this.readyPromise = (options.readyPromise || Promise.resolve(true)).then(r => this.ready = r);
    this.tileWidth = 512;
    this.tileHeight = 512;
    this.maximumLevel = 17;
    this.minimumLevel = 0;
    this.tilingScheme = options.tilingScheme || new Cesium.WebMercatorTilingScheme;
    this.rectangle = options.rectangle || Cesium.Rectangle.MAX_VALUE;
    this.errorEvent = {};
    this.credit = new Cesium.Credit(options.credit || '', false);
    this.hasAlphaChannel = Cesium.defaultValue(options.hasAlphaChannel, true);
    this.cache_ = {};
    this.url_ = '';
  }

  getTileCredits() {
    return [];
  }

  pickFeatures() {
  }

  requestImage(x, y, z, request) {
    const url = this.url_.replace('{x}', x).replace('{y}', y).replace('{z}', z);
    let promise = this.cache_[url];
    if (!promise) {
      promise = this.cache_[url] = rasterizeTile(url);
    }
    return promise;
  }
}


export function rasterizeTile(url) {
  const canvas = document.createElement('canvas');
  const vectorContext = toContext(canvas.getContext('2d'), {size: [512, 512]});

  return fetch(url).then(r => r.status === 200 && r.arrayBuffer().then(
    buffer => {
      const features = format.readFeatures(buffer,{
        extent: getProjection('EPSG:3857').getExtent()
      });
      console.log('features', features)

      const scaleFactor = 512 / 4096;
      features.forEach(f => {
        const flatCoordinates = f.getFlatCoordinates();
        for (let i = 0; i < flatCoordinates.length; ++i) {
          flatCoordinates[i] *= scaleFactor;
        }
      });

      const instructionsByZindex = {};
      features.forEach(feature => {
        const styles = defaultStyles(feature);
        styles.forEach(style => {
          const zIndex = style.getZIndex() || 0;
          const instructions = instructionsByZindex[zIndex] = instructionsByZindex[zIndex] || [];
          instructions.push({
            style,
            feature
          });
        });
      });

      const keys = Object.keys(instructionsByZindex).sort();
      keys.forEach(key => {
        instructionsByZindex[key].forEach(instructions => {
          const {style, feature} = instructions;
          const geometry = style.getGeometry() || feature.getGeometry();
          vectorContext.setStyle(style);
          vectorContext.drawGeometry(geometry);
        });
      });

      return canvas;
    })
  ).catch(e => console.log(e)
  ).finally(() => canvas)
}

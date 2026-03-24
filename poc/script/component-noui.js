/*
  Pink Trombone — No-UI web component wrapper
  Imports the audio engine only (no graphics dependencies)
*/

import {} from "./PinkTrombone.js";

window.AudioContext = window.AudioContext || window.webkitAudioContext;

class PinkTromboneElement extends HTMLElement {
  constructor() {
    super();
    this._animationFrameObservers = [];

    window.customElements.whenDefined("pink-trombone").then(() => {
      // Audio Parameters
      this.addEventListener("setParameter", (event) => {
        const parameterName = event.detail.parameterName;
        const audioParam = parameterName
          .split(".")
          .reduce((audioParam, propertyName) => audioParam[propertyName], this.parameters);
        const newValue = Number(event.detail.newValue);
        switch (event.detail.type) {
          case "linear":
            audioParam.linearRampToValueAtTime(newValue, this.audioContext.currentTime + event.detail.timeOffset);
            break;
          default:
            audioParam.value = newValue;
        }
        event.stopPropagation();
      });
    });

    const loadEvent = new Event("load");
    this.dispatchEvent(loadEvent);
  }

  setAudioContext(audioContext = new window.AudioContext()) {
    this.pinkTrombone = audioContext.createPinkTrombone();

    this.loadPromise = this.pinkTrombone.loadPromise.then((audioContext) => {
      this.parameters = this.pinkTrombone.parameters;
      for (let parameterName in this.pinkTrombone.parameters)
        this[parameterName] = this.pinkTrombone.parameters[parameterName];
      return this.pinkTrombone;
    });
    return this.loadPromise;
  }

  get audioContext() {
    if (this.pinkTrombone) return this.pinkTrombone.audioContext;
    else throw "Audio Context has not been set";
  }

  connect() {
    if (this.pinkTrombone) return this.pinkTrombone.connect(...arguments);
  }
  disconnect() {
    if (this.pinkTrombone) return this.pinkTrombone.disconnect(...arguments);
  }

  start() {
    if (this.pinkTrombone) this.pinkTrombone.start();
    else throw "Pink Trombone hasn't been set yet";
  }
  stop() {
    if (this.pinkTrombone) this.pinkTrombone.stop();
    else throw "Pink Trombone hasn't been set yet";
  }

  get constrictions() { return this.pinkTrombone.constrictions; }
  newConstriction() { return this.pinkTrombone.newConstriction(...arguments); }
  removeConstriction(constriction) { return this.pinkTrombone.removeConstriction(constriction); }
  getProcessor() { return this.pinkTrombone.getProcessor(); }
}

window.customElements.define("pink-trombone", PinkTromboneElement);

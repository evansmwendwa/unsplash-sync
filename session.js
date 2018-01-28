module.exports = class Session {

  constructor() {
    this.baseKey = "__settings";
    var LocalStorage = require('node-localstorage').LocalStorage;
    this.localStorage = new LocalStorage('./session');
    this.state = this.getState();
  }

  getState() {
    let _raw;

    try {
      _raw = this.localStorage.getItem(this.baseKey);

      if(_raw === null) {
        _raw = '{}';
      }

      return JSON.parse(_raw);

    } catch(e) {
      return {};
    }
  }

  updateState(data) {
    try {
      this.localStorage.setItem( this.baseKey, JSON.stringify(data) );
      return true;
    } catch(e) {
      return false;
    }
  }

  deleteState() {
    this.state = {};
    try {
      this.localStorage.removeItem(this.baseKey);
    } catch(e) {
      console.log(e.message);
    }
  }

  set(key, value) {
      var _stateType = typeof this.state;

      if(_stateType === 'object') {
          if(_stateType === null) {
              this.state = {};
          }
      } else {
          this.state = {};
      }

      try {
          this.state[key] = value;
      } catch(e) {
          console.log(e.message);
      }

      this.updateState(this.state);
  }

  get(key, defaultValue) {
    if(!this.state.hasOwnProperty(key)) {
        return defaultValue;
    }

    return this.state[key];
  }

  remove(key) {
      try {
          this.set(key, "");
          delete this.state[key];
          this.updateState(this.state);
      } catch(e) {
          console.log(e);
      }

  }

}

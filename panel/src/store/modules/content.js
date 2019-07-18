import Vue from "vue";
import Api from "@/api/api.js";
import clone from "@/helpers/clone.js";

export default {
  namespaced: true,
  state: {
    current: null,
    models: {},
    status: {
      interactable: true,
      lock: null,
      unlock: null
    }
  },
  getters: {
    exists: state => id => {
      return state.models.hasOwnProperty(id);
    },
    hasChanges: (state, getters) => id => {
      id = id || state.current;
      let changes = getters.model(id).changes;
      return Object.keys(changes).length > 0;
    },
    id: (state, getters, rootState) => id => {
      if (rootState.languages.current) {
        return id + "/" + rootState.languages.current.code;
      } else {
        return id;
      }
    },
    isCurrent: (state) => id => {
      return state.current === id;
    },
    model: (state, getters) => id => {
      id = id || state.current;

      if (getters.exists(id) === true) {
        return state.models[id];
      }

      return {
        api: null,
        originals: {},
        values: {},
        changes: {},
      };
    },
    originals: (state, getters) => id => {
      return clone(getters.model(id).originals);
    },
    value: (state, getters) => (field, id) => {
      return getters.values(id)[field];
    },
    values: (state, getters) => id => {
      return clone(getters.model(id).values);
    }
  },
  mutations: {
    CREATE(state, model) {
      Vue.set(state.models, model.id, {
        api: model.api,
        originals: clone(model.content),
        values: clone(model.content),
        changes: {}
      });
    },
    CURRENT(state, id) {
      state.current = id;
    },
    INTERACTABLE(state, interactable) {
      Vue.set(state.status, "interactable", interactable);
    },
    LOCK(state, lock) {
      Vue.set(state.status, "lock", lock);
    },
    MOVE(state, [from, to]) {
      // move state
      const model = clone(state.models[from]);
      Vue.delete(state.models, from);
      Vue.set(state.models, to, model);

      // move local storage
      const storage = localStorage.getItem("kirby$content$" + from);
      localStorage.removeItem("kirby$content$" + from);
      localStorage.setItem("kirby$content$" + to, storage);
    },
    REMOVE(state, id) {
      Vue.delete(state.models, id);
      localStorage.removeItem("kirby$content$" + id);
    },
    REVERT(state, id) {
      Vue.set(state.models[id], "values", clone(state.models[id].originals));
      Vue.set(state.models[id], "changes", {});
      localStorage.removeItem("kirby$content$" + id);
    },
    UNLOCK(state, unlock) {
      Vue.set(state.status, "unlock", unlock);
    },
    UPDATE(state, [id, field, value]) {
      // avoid updating without a valid model
      if (!state.models[id]) {
        return false;
      }

      value = clone(value);

      Vue.set(state.models[id].values, field, value);

      const original = JSON.stringify(state.models[id].originals[field]);
      const current = JSON.stringify(value);

      if (original === current) {
        Vue.delete(state.models[id].changes, field);
      } else {
        Vue.set(state.models[id].changes, field, true);
      }

      localStorage.setItem(
        "kirby$content$" + id,
        JSON.stringify({
          api: state.models[id].api,
          originals: state.models[id].originals,
          values: state.models[id].values,
          changes: state.models[id].changes
        })
      );
    }
  },
  actions: {
    create(context, model) {
      // attach the language to the id
      if (
        context.rootState.languages.current &&
        context.rootState.languages.current.code
      ) {
        model.id = context.getters.id(model.id);
      }

      // remove title from model content
      if (model.id.startsWith("pages/") || model.id.startsWith("site")) {
        delete model.content.title;
      }

      context.commit("CREATE", model);
      context.commit("CURRENT", model.id);
      context.dispatch("load", model);
    },
    load(context, model) {
      const stored = localStorage.getItem("kirby$content$" + model.id);

      if (stored) {
        const data = JSON.parse(stored);

        Api.get(model.api + "/unlock").then(response => {
          if (response.isUnlocked === true) {
            context.commit("UNLOCK", data.values);
            return;
          }

          Object.keys(data.values || {}).forEach(field => {
            const value = data.values[field];
            context.commit("UPDATE", [model.id, field, value]);
          });
        });
      }
    },
    interactable(context, interactable = true) {
      context.commit("INTERACTABLE", interactable);
    },
    lock(context, lock) {
      context.commit("LOCK", lock);
    },
    move(context, [from, to]) {
      context.commit("MOVE", [from, to]);
    },
    remove(context, id) {
      context.commit("REMOVE", id);
    },
    reset(context) {
      context.commit("CURRENT", null);
      context.commit("LOCK", null);
      context.commit("UNLOCK", null);
    },
    revert(context, id) {
      id = id || context.state.current;
      context.commit("REVERT", id);
    },
    save(context, id) {
      id = id || context.state.current;

      const model = context.getters.model(id);

      if (
        context.getters.isCurrent(id) &&
        context.state.status.interactable === false
      ) {
        return false;
      }

      context.dispatch("interactable", false);

      // Send to api
      return Api
        .patch(model.api, model.values)
        .then(() => {
          context.dispatch("revert", id);
          context.dispatch("interactable", true);
        })
        .catch(error => {
          context.dispatch("interactable", true);
          throw error;
        });
    },
    unlock(context, unlock) {
      context.commit("UNLOCK", unlock);
    },
    update(context, [field, value, id]) {
      id = id || context.state.current;
      context.commit("UPDATE", [id, field, value]);
    }
  }
};

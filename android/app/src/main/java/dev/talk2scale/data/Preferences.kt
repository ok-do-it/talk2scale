package dev.talk2scale.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "talk2scale_prefs")

class Preferences(private val context: Context) {
    private val scaleMacKey = stringPreferencesKey("scale_mac")
    private val userIdKey = intPreferencesKey("user_id")

    val scaleMac: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[scaleMacKey]
    }

    val userId: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[userIdKey] ?: DEFAULT_USER_ID
    }

    suspend fun setScaleMac(mac: String) {
        context.dataStore.edit { prefs -> prefs[scaleMacKey] = mac }
    }

    suspend fun clearScaleMac() {
        context.dataStore.edit { prefs -> prefs.remove(scaleMacKey) }
    }

    suspend fun setUserId(userId: Int) {
        context.dataStore.edit { prefs -> prefs[userIdKey] = userId }
    }

    companion object {
        const val DEFAULT_USER_ID = 1
    }
}

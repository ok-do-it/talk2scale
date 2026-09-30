import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val apiBaseUrl = providers.gradleProperty("talk2scale.apiBaseUrl")
    .orElse(localProperty("talk2scale.apiBaseUrl"))
    .orElse("http://10.0.2.2:8888")

android {
    namespace = "dev.talk2scale"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.talk2scale.android"
        minSdk = 34
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "API_BASE_URL", "\"${apiBaseUrl.get()}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    val composeBom = platform(libs.compose.bom)
    implementation(composeBom)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.icons)
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.process)
    implementation(libs.coroutines.android)
    implementation(libs.retrofit)
    implementation(libs.okhttp)
    implementation(libs.serialization.json)
    implementation(libs.serialization.converter)
    implementation(libs.datastore.preferences)
    debugImplementation(libs.compose.ui.tooling)
}

fun localProperty(name: String): Provider<String> {
    val localFile = rootProject.file("local.properties")
    if (!localFile.exists()) {
        return provider { "" }.filter { it.isNotEmpty() }
    }
    val file = rootProject.layout.projectDirectory.file("local.properties")
    return providers.fileContents(file).asText
        .map { text ->
            text.lineSequence()
                .map { it.substringBefore('#').trim() }
                .filter { it.startsWith("$name=") }
                .map { it.substringAfter("=").trim() }
                .firstOrNull { it.isNotEmpty() }
                .orEmpty()
        }
        .filter { it.isNotEmpty() }
}

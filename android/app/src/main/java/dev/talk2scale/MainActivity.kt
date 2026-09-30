package dev.talk2scale

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import dev.talk2scale.ui.connection.ConnectionScreen
import dev.talk2scale.ui.home.HomeScreen
import dev.talk2scale.ui.recipe.CreateRecipeScreen
import dev.talk2scale.ui.theme.Talk2ScaleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Talk2ScaleTheme {
                val navController = rememberNavController()
                NavHost(navController = navController, startDestination = "home") {
                    composable("home") {
                        HomeScreen(
                            onOpenConnection = { autoStart ->
                                navController.navigate("connection?autoStart=$autoStart")
                            },
                            onOpenRecipe = { navController.navigate("createRecipe") },
                        )
                    }
                    composable(
                        route = "connection?autoStart={autoStart}",
                        arguments = listOf(
                            navArgument("autoStart") {
                                type = NavType.BoolType
                                defaultValue = false
                            },
                        ),
                    ) { entry ->
                        ConnectionScreen(
                            autoStart = entry.arguments?.getBoolean("autoStart") ?: false,
                            onBack = { navController.popBackStack() },
                        )
                    }
                    composable("createRecipe") {
                        CreateRecipeScreen(onBack = { navController.popBackStack() })
                    }
                }
            }
        }
    }
}

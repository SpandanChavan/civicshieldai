"""
OR-Tools based vehicle routing and resource allocation optimization.
"""
import math
from typing import List, Dict, Any

try:
    from ortools.constraint_solver import routing_enums_pb2
    from ortools.constraint_solver import pywrapcp
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False
    print("[ML] OR-Tools not installed — using greedy fallback")


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance in km using Haversine formula."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _build_distance_matrix(locations: List[Dict]) -> List[List[int]]:
    """Build integer distance matrix (metres) for OR-Tools."""
    n = len(locations)
    matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            if i == j:
                row.append(0)
            else:
                km = _haversine_km(
                    locations[i]["lat"], locations[i]["lon"],
                    locations[j]["lat"], locations[j]["lon"],
                )
                row.append(int(km * 1000))  # metres
        matrix.append(row)
    return matrix


def optimize_routes(
    depot: Dict,
    destinations: List[Dict],
    num_vehicles: int = 3,
    max_distance_km: float = 500.0,
) -> Dict[str, Any]:
    """
    Solve Vehicle Routing Problem using Google OR-Tools.

    Returns optimized routes with total distance for each vehicle.
    """
    all_locations = [depot] + destinations
    n = len(all_locations)
    distance_matrix = _build_distance_matrix(all_locations)

    if not ORTOOLS_AVAILABLE:
        # Greedy nearest-neighbour fallback
        routes = _greedy_routes(all_locations, num_vehicles)
        return {"method": "greedy_fallback", "routes": routes, "note": "Install ortools for optimal routes"}

    # OR-Tools VRP setup
    manager = pywrapcp.RoutingIndexManager(n, num_vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_idx, to_idx):
        from_node = manager.IndexToNode(from_idx)
        to_node = manager.IndexToNode(to_idx)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Max distance constraint per vehicle
    max_dist_m = int(max_distance_km * 1000)
    routing.AddDimension(
        transit_callback_index,
        0,
        max_dist_m,
        True,
        "Distance",
    )

    # Search parameters
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.seconds = 10

    solution = routing.SolveWithParameters(search_params)

    if not solution:
        return {"error": "No feasible route found within constraints"}

    routes = []
    for vehicle_id in range(num_vehicles):
        route = []
        total_dist_m = 0
        idx = routing.Start(vehicle_id)
        while not routing.IsEnd(idx):
            node = manager.IndexToNode(idx)
            route.append({
                "location": all_locations[node],
                "step": len(route),
            })
            prev_idx = idx
            idx = solution.Value(routing.NextVar(idx))
            total_dist_m += distance_matrix[manager.IndexToNode(prev_idx)][manager.IndexToNode(idx)]

        if len(route) > 1:
            routes.append({
                "vehicle_id": vehicle_id,
                "stops": route,
                "total_distance_km": round(total_dist_m / 1000, 2),
            })

    return {
        "method": "ortools_vrp",
        "num_vehicles": num_vehicles,
        "routes": routes,
        "total_destinations": len(destinations),
    }


def _greedy_routes(all_locations: List[Dict], num_vehicles: int) -> List[Dict]:
    """Simple round-robin assignment as greedy fallback."""
    destinations = all_locations[1:]
    routes = [{"vehicle_id": i, "stops": [all_locations[0]], "total_distance_km": 0} for i in range(num_vehicles)]
    for i, dest in enumerate(destinations):
        routes[i % num_vehicles]["stops"].append(dest)
    return routes


def optimize_allocation(
    resources: List[Dict],
    demands: List[Dict],
    objective: str = "minimize_time",
) -> Dict[str, Any]:
    """
    Greedy resource allocation matching supply to demand by proximity.

    M4 FIX: Resources are consumed from the pool after each assignment.
    No resource can appear in more than one demand's assignment.
    When supply < demand, remaining demands are correctly reported as unmet.
    """
    assignments = []
    unmet = []

    # Build a pool of available resource IDs (consumed set tracks what's used)
    consumed_ids: set = set()
    available_pool = [r for r in resources if r.get("status") == "available"]

    for demand in demands:
        d_lat = demand.get("lat", 0)
        d_lon = demand.get("lon", 0)
        needed = demand.get("quantity", 1)

        # Only consider resources not yet consumed
        candidates = [
            {"resource": r, "distance_km": round(_haversine_km(d_lat, d_lon, r.get("lat", 0), r.get("lon", 0)), 2)}
            for r in available_pool
            if r.get("id") not in consumed_ids
        ]
        candidates.sort(key=lambda x: x["distance_km"])

        fulfilled = candidates[:needed]
        if fulfilled:
            # Mark these resources as consumed so they cannot be re-used
            for a in fulfilled:
                consumed_ids.add(a["resource"]["id"])
            assignments.append({
                "demand_id": demand.get("id"),
                "assigned_resources": [a["resource"]["id"] for a in fulfilled],
                "nearest_km": fulfilled[0]["distance_km"],
            })
        else:
            unmet.append(demand.get("id"))

    return {
        "assignments": assignments,
        "unmet_demands": unmet,
        "fulfillment_rate": round(len(assignments) / max(len(demands), 1), 2),
    }

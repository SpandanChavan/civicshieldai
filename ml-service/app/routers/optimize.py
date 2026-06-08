from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.services.ortools_service import optimize_routes, optimize_allocation

router = APIRouter()


class Location(BaseModel):
    id: str
    lat: float
    lon: float
    name: Optional[str] = None


class VehicleRoutingRequest(BaseModel):
    depot: Location                     # Starting point for all vehicles
    destinations: List[Location]        # List of delivery/rescue points
    num_vehicles: int = 3               # Number of vehicles available
    max_distance_km: float = 500.0      # Max distance per vehicle


class ResourceAllocationRequest(BaseModel):
    resources: List[Dict[str, Any]]     # Available resources with location, capacity
    demands: List[Dict[str, Any]]       # Demand points with required resources
    objective: str = "minimize_time"    # "minimize_time" | "maximize_coverage"


@router.post("/routes")
def optimize_vehicle_routes(req: VehicleRoutingRequest):
    """
    Vehicle Routing Problem (VRP) optimization using Google OR-Tools.
    Returns optimized routes for emergency resource delivery.
    """
    if len(req.destinations) == 0:
        raise HTTPException(status_code=422, detail="At least 1 destination required")
    if req.num_vehicles < 1:
        raise HTTPException(status_code=422, detail="At least 1 vehicle required")

    try:
        result = optimize_routes(
            depot=req.depot.dict(),
            destinations=[d.dict() for d in req.destinations],
            num_vehicles=req.num_vehicles,
            max_distance_km=req.max_distance_km,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route optimization failed: {str(e)}")


@router.post("/allocate")
def allocate_resources(req: ResourceAllocationRequest):
    """
    Optimize emergency resource allocation across multiple disaster zones.
    """
    try:
        return optimize_allocation(
            resources=req.resources,
            demands=req.demands,
            objective=req.objective,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Allocation optimization failed: {str(e)}")

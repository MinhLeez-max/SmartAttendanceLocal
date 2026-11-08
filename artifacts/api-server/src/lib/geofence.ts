const EARTH_RADIUS_METERS = 6371000;
export function distanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(latitudeB - latitudeA);
    const longitudeDelta = radians(longitudeB - longitudeA);
    const startLatitude = radians(latitudeA);
    const endLatitude = radians(latitudeB);
    const haversine = Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(startLatitude) *
            Math.cos(endLatitude) *
            Math.sin(longitudeDelta / 2) ** 2;
    const boundedHaversine = Math.min(1, Math.max(0, haversine));
    return (2 *
        EARTH_RADIUS_METERS *
        Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine)));
}

  import {
    Card,
    CardContent,
    CardMedia,
    Typography,
    Box,
    Tooltip
  } from "@mui/material";
  
  
  export default function CustomTooltip({ active, payload}) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  console.log(data)

return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        padding: "10px",
        borderRadius: "8px",
        color: "white",
        width: 180,
      }}
    >
      <p style={{ margin: 0, fontSize: 12 }}>
        {console.log(new Date(data.Release_Date))}
        📅 {new Date(data.x).toDateString()}
      </p>

      <p style={{ margin: "4px 0", fontSize: 12 }}>
        {console.log(data.y)}
        ⭐ {data.y}
      </p>

      {data.Poster_Url && (
        <img
          src={data.Poster_Url}
          alt={data.title}
          style={{
            width: "100%",
            height: 90,
            objectFit: "cover",
            borderRadius: 6,
            marginTop: 6,
          }}
        />
      )}

      <p style={{ margin: "6px 0 0", fontSize: 12 }}>
        🎬 {data.title}
      </p>
    </div>
  );
}